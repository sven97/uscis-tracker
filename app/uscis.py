import asyncio
import json
import logging
import os
import re
import time
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession

logger = logging.getLogger(__name__)

RECEIPT_RE = re.compile(r"^[A-Z]{3}\d{10}$", re.IGNORECASE)
USCIS_ROOT_URL = "https://egov.uscis.gov/"
FLARESOLVERR_URL = os.environ.get("FLARESOLVERR_URL", "http://flaresolverr:8191/v1")

# Solving the Cloudflare challenge via FlareSolverr is by far the slowest part of
# a fetch (seconds). The resulting cf_clearance cookie and the getCaseStatus
# action ID are reusable for many minutes, so we cache the solved session and
# reuse it across fetches — only re-solving when it expires or a POST is rejected.
CF_SESSION_TTL = float(os.environ.get("CF_SESSION_TTL_MINUTES", "15")) * 60


class _CFSession:
    """A solved Cloudflare session: CF cookies, matching UA, and action ID."""

    def __init__(self, cookies: dict, user_agent: str, action_id: str):
        self.cookies = cookies
        self.user_agent = user_agent
        self.action_id = action_id
        self.expires_at = time.monotonic() + CF_SESSION_TTL

    @property
    def expired(self) -> bool:
        return time.monotonic() >= self.expires_at


_cf_session: Optional[_CFSession] = None
_cf_lock = asyncio.Lock()

# Bundle that contains all Server Action registrations.
# If USCIS redeploys and renames it, fetch /  and look for the bundle referenced
# in the RSC module map with "default" export for module 7640.
_ACTION_BUNDLE = "0fep78v8kvbf_.js"

# Turbopack action IDs are 42-char hex strings (different from webpack's 40).
# Pattern: createServerReference("<id>", ..., "<name>")
_ACTION_REF_RE = re.compile(
    r'createServerReference\)?\("([0-9a-f]{38,46})"[^"]*"getCaseStatus"',
    re.IGNORECASE,
)

# Fallback UA only — the real UA is taken from the FlareSolverr solution so it
# matches the cf_clearance cookie (Cloudflare binds clearance to the exact UA).
_FALLBACK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
_BROWSER_HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": USCIS_ROOT_URL.rstrip("/"),
    "Referer": USCIS_ROOT_URL,
}


def validate_receipt_number(receipt: str) -> bool:
    return bool(RECEIPT_RE.match(receipt.strip()))


# USCIS exposes no "finished" flag, so we infer it from the action code text.
# These markers cover the terminal outcomes of a case (lowercased substrings).
# "Card was picked up by USPS" is intentionally excluded — the case isn't done
# until "Card Was Delivered".
_TERMINAL_STATUS_MARKERS = (
    "approved",
    "denied",
    "rejected",
    "case closed",
    "withdrawn",
    "terminated",
    "card was delivered",
)


def is_terminal_status(action_code_text: Optional[str]) -> bool:
    """True if the status text represents a finished (terminal) case outcome."""
    if not action_code_text:
        return False
    text = action_code_text.lower()
    return any(marker in text for marker in _TERMINAL_STATUS_MARKERS)


def _js_from_flaresolverr_response(html: str) -> str:
    """Chrome wraps plain-text files in <html><body><pre>...</pre>. Unwrap."""
    soup = BeautifulSoup(html, "lxml")
    pre = soup.find("pre")
    return pre.get_text() if pre else html


async def _get_action_id(session_id: str, flare_client: httpx.AsyncClient) -> Optional[str]:
    """
    Fetch the USCIS main JS bundle via FlareSolverr (already CF-solved session)
    and extract the getCaseStatus Server Action ID.
    """
    r = await flare_client.post(FLARESOLVERR_URL, json={
        "cmd": "request.get",
        "url": f"{USCIS_ROOT_URL}_next/static/chunks/{_ACTION_BUNDLE}",
        "session": session_id,
        "maxTimeout": 30000,
    })
    d = r.json()
    if d.get("status") != "ok":
        logger.warning(f"Could not fetch action bundle: {d.get('message')}")
        return None

    js = _js_from_flaresolverr_response(d["solution"]["response"])
    m = _ACTION_REF_RE.search(js)
    if m:
        logger.debug(f"getCaseStatus action ID: {m.group(1)}")
        return m.group(1)

    logger.warning("getCaseStatus action ID not found in bundle")
    return None


def _parse_rsc_stream(text: str) -> Optional[dict]:
    """
    Parse a Next.js RSC stream (text/x-component) for CaseStatusResponse.
    Lines are: <index>:<json-object>
    """
    for line in text.splitlines():
        if "CaseStatusResponse" not in line:
            continue
        body = re.sub(r"^\d+:", "", line.strip())
        try:
            obj = json.loads(body)
        except json.JSONDecodeError:
            continue
        csr = (
            obj.get("data", {}).get("CaseStatusResponse")
            or obj.get("CaseStatusResponse")
        )
        if csr:
            return _extract_status(csr)
    return None


def _extract_status(csr: dict) -> Optional[dict]:
    """
    Map a CaseStatusResponse dict to our USCIS-aligned fields.

    The English payload lives under detailsEng:
        formNum, formTitle, actionCodeText, actionCodeDesc
    with isValid on the response root.
    """
    details = csr.get("detailsEng") or csr.get("details") or {}

    action_code_text = (
        details.get("actionCodeText")
        # Legacy/alternate shapes seen on older deployments
        or details.get("currentStatusText")
        or details.get("statusText")
        or csr.get("actionCodeText")
    )
    action_code_desc = (
        details.get("actionCodeDesc")
        or details.get("description")
        or details.get("statusDescription")
        or csr.get("actionCodeDesc")
    )

    if not action_code_text:
        logger.debug(
            f"CaseStatusResponse unknown shape — keys: {list(csr.keys())}, "
            f"detailsEng keys: {list(details.keys())}"
        )
        return None

    return {
        "action_code_text": action_code_text,
        "action_code_desc": action_code_desc or "",
        "form_num": details.get("formNum"),
        "form_title": details.get("formTitle"),
        "is_valid": csr.get("isValid"),
    }


async def _solve_cf_session() -> Optional[_CFSession]:
    """
    Run the full FlareSolverr challenge solve: create a session, GET the root to
    obtain CF cookies + UA, and extract the getCaseStatus action ID. This is the
    expensive step — callers should reuse the returned session via _get_cf_session.
    """
    session_id = None
    try:
        async with httpx.AsyncClient(timeout=120) as flare_client:
            r = await flare_client.post(FLARESOLVERR_URL, json={"cmd": "sessions.create"})
            session_id = r.json()["session"]

            # GET root to solve CF and collect cookies
            r1 = await flare_client.post(FLARESOLVERR_URL, json={
                "cmd": "request.get",
                "url": USCIS_ROOT_URL,
                "session": session_id,
                "maxTimeout": 60000,
            })
            d1 = r1.json()
            if d1.get("status") != "ok":
                logger.warning(f"FlareSolverr root GET failed: {d1.get('message')}")
                return None

            cookies = {c["name"]: c["value"] for c in d1["solution"].get("cookies", [])}
            # cf_clearance is bound to this exact UA — reuse it for the POST.
            user_agent = d1["solution"].get("userAgent") or _FALLBACK_UA

            # Fetch action ID from bundle (CF already solved in this session)
            action_id = await _get_action_id(session_id, flare_client)
            if not action_id:
                return None

            logger.info(f"Solved new CF session (UA cookies: {list(cookies.keys())})")
            return _CFSession(cookies, user_agent, action_id)

    except Exception as e:
        logger.warning(f"FlareSolverr setup failed: {e}")
        return None
    finally:
        if session_id:
            try:
                async with httpx.AsyncClient(timeout=10) as c:
                    await c.post(FLARESOLVERR_URL, json={"cmd": "sessions.destroy", "session": session_id})
            except Exception:
                pass


async def _get_cf_session(force: bool = False) -> Optional[_CFSession]:
    """
    Return a valid cached CF session, solving a new one only if the cache is
    empty, expired, or a refresh is forced. The lock collapses concurrent callers
    (e.g. a batch poll) onto a single solve instead of stampeding FlareSolverr.
    """
    global _cf_session
    async with _cf_lock:
        if not force and _cf_session and not _cf_session.expired:
            return _cf_session
        _cf_session = await _solve_cf_session()
        return _cf_session


async def _post_server_action(receipt: str, cf: _CFSession):
    """POST the getCaseStatus Server Action via curl_cffi (Chrome TLS impersonation)."""
    async with AsyncSession(impersonate="chrome") as session:
        return await session.post(
            USCIS_ROOT_URL,
            data=json.dumps([receipt.upper()]),
            headers={
                **_BROWSER_HEADERS,
                "User-Agent": cf.user_agent,
                "Content-Type": "text/plain;charset=UTF-8",
                "Next-Action": cf.action_id,
            },
            cookies=cf.cookies,
            timeout=30,
        )


async def fetch_case_status(receipt: str) -> Optional[dict]:
    """
    Fetch USCIS case status.

    USCIS runs a Next.js App Router SPA at https://egov.uscis.gov/. The case
    status is loaded via a Next.js Server Action:
        POST /  body=["RECEIPT_NUMBER"]  Next-Action: <getCaseStatus-id>

    Fast path: reuse a cached CF session (cookies + UA + action ID) and just do
    the curl_cffi POST. Only when there is no valid session — or the POST is
    rejected (403, stale cf_clearance) — do we pay for a fresh FlareSolverr solve.
    """
    cf = await _get_cf_session()
    if not cf:
        return None

    for attempt in (1, 2):
        try:
            resp = await _post_server_action(receipt, cf)
        except Exception as e:
            logger.warning(f"curl_cffi POST failed for {receipt}: {e}")
            return None

        logger.debug(f"Server Action HTTP {resp.status_code} for {receipt}, body: {resp.text[:300]}")

        if resp.status_code == 200:
            result = _parse_rsc_stream(resp.text)
            if result:
                return result
            logger.warning(f"Server Action 200 but no CaseStatusResponse for {receipt}. Body: {resp.text[:400]}")
            return None

        # Non-200 usually means the cached cf_clearance went stale. Re-solve once.
        logger.warning(f"Server Action returned HTTP {resp.status_code} for {receipt}"
                       f"{' — re-solving CF session' if attempt == 1 else ''}")
        if attempt == 1:
            cf = await _get_cf_session(force=True)
            if not cf:
                return None

    return None
