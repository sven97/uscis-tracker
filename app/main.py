"""USCIS Case Tracker — self-hosted JSON API + static SPA host."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv

load_dotenv()

import asyncio

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import scheduler as scheduler_mod
from app.database import get_db, init_db
from app.models import Case, StatusHistory
from app.notify import send_notification
from app.poller import refresh_case as do_refresh
from app.schemas import (
    CaseCreate,
    CaseEventRead,
    CasePreview,
    CaseRead,
    CaseUpdate,
    SettingsRead,
    SettingsUpdate,
    TestNotification,
)
from app.settings_store import (
    get_apprise_urls,
    get_poll_enabled,
    get_poll_interval_hours,
    set_setting,
)
from app.uscis import (
    ReceiptInvalid,
    fetch_case_status,
    is_terminal_status,
    validate_receipt_number,
    warm_session,
)

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

STATIC_DIR = os.environ.get("STATIC_DIR", "app/static")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    init_db()
    scheduler_mod.start_scheduler()
    # Warm the Cloudflare session in the background so the first refresh is fast.
    asyncio.create_task(warm_session())
    yield
    scheduler_mod.shutdown()


app = FastAPI(title="USCIS Case Tracker", lifespan=lifespan)

# Production serves the SPA same-origin (no CORS needed); this is only for local
# dev where the Vite server (5173) calls the API on another port.
_cors = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── API ───────────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/cases", response_model=list[CaseRead])
async def list_cases(db: Session = Depends(get_db)) -> list[CaseRead]:
    cases = db.query(Case).order_by(Case.created_at.desc()).all()
    return [CaseRead.from_model(c) for c in cases]


def _get_case_or_404(db: Session, case_id: int) -> Case:
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(404, "Case not found")
    return case


@app.post("/api/cases/preview", response_model=CasePreview)
async def preview_case(body: CaseCreate, db: Session = Depends(get_db)) -> CasePreview:
    """Fetch a receipt's current status without adding it to the tracking list."""
    receipt = body.receipt_number.strip().upper()
    if not validate_receipt_number(receipt):
        raise HTTPException(422, "Invalid receipt number (expected 3 letters + 10 digits)")
    if db.query(Case).filter(Case.receipt_number == receipt).first():
        raise HTTPException(409, f"Case {receipt} is already tracked")

    try:
        result = await fetch_case_status(receipt)
    except ReceiptInvalid:
        raise HTTPException(422, f"USCIS doesn't recognize {receipt} as a case number.")
    if not result:
        raise HTTPException(502, "Couldn't reach USCIS for that receipt number. Try again in a moment.")
    return CasePreview(
        receipt_number=receipt,
        status=result["action_code_text"],
        detail=result.get("action_code_desc") or None,
        form_num=result.get("form_num"),
        form_title=result.get("form_title"),
        is_finished=is_terminal_status(result["action_code_text"]),
    )


@app.post("/api/cases", response_model=CaseRead, status_code=201)
async def add_case(
    body: CaseCreate, background: BackgroundTasks, db: Session = Depends(get_db)
) -> CaseRead:
    receipt = body.receipt_number.strip().upper()
    if not validate_receipt_number(receipt):
        raise HTTPException(422, "Invalid receipt number (expected 3 letters + 10 digits)")
    if db.query(Case).filter(Case.receipt_number == receipt).first():
        raise HTTPException(409, f"Case {receipt} is already tracked")

    case = Case(receipt_number=receipt, nickname=(body.nickname or "").strip() or None, notify=body.notify)
    db.add(case)
    db.commit()
    db.refresh(case)

    # Fetch in the background so adding returns instantly (a cold solve can be slow).
    background.add_task(do_refresh, case.id, "manual")
    return CaseRead.from_model(case)


@app.get("/api/cases/{case_id}", response_model=CaseRead)
async def get_case(case_id: int, db: Session = Depends(get_db)) -> CaseRead:
    return CaseRead.from_model(_get_case_or_404(db, case_id))


@app.patch("/api/cases/{case_id}", response_model=CaseRead)
async def update_case(case_id: int, body: CaseUpdate, db: Session = Depends(get_db)) -> CaseRead:
    case = _get_case_or_404(db, case_id)
    if body.nickname is not None:
        case.nickname = body.nickname.strip() or None
    if body.notify is not None:
        case.notify = body.notify
    if body.archived is not None:
        case.archived = body.archived
    db.commit()
    db.refresh(case)
    return CaseRead.from_model(case)


@app.delete("/api/cases/{case_id}", status_code=204)
async def delete_case(case_id: int, db: Session = Depends(get_db)) -> None:
    case = _get_case_or_404(db, case_id)
    db.delete(case)
    db.commit()


@app.post("/api/cases/{case_id}/refresh", response_model=CaseRead, status_code=202)
async def refresh_case(
    case_id: int, background: BackgroundTasks, db: Session = Depends(get_db)
) -> CaseRead:
    case = _get_case_or_404(db, case_id)
    # Kick the fetch off in the background and return immediately; the UI polls the
    # case (last_checked) until the new status lands.
    background.add_task(do_refresh, case_id, "manual")
    return CaseRead.from_model(case)


@app.get("/api/cases/{case_id}/history", response_model=list[CaseEventRead])
async def case_history(case_id: int, db: Session = Depends(get_db)) -> list[StatusHistory]:
    _get_case_or_404(db, case_id)
    return (
        db.query(StatusHistory)
        .filter(StatusHistory.case_id == case_id)
        .order_by(StatusHistory.recorded_at.desc())
        .all()
    )


def _settings_read() -> SettingsRead:
    return SettingsRead(
        apprise_urls=get_apprise_urls(),
        poll_interval_hours=get_poll_interval_hours(),
        poll_enabled=get_poll_enabled(),
    )


@app.get("/api/settings", response_model=SettingsRead)
async def get_settings() -> SettingsRead:
    return _settings_read()


@app.put("/api/settings", response_model=SettingsRead)
async def update_settings(body: SettingsUpdate) -> SettingsRead:
    """Partial update — only the fields present in the body are applied, so each
    section of the Settings UI can save on its own."""
    if body.apprise_urls is not None:
        set_setting("apprise_urls", "\n".join(u.strip() for u in body.apprise_urls if u.strip()))
    if body.poll_interval_hours is not None:
        set_setting("poll_interval_hours", str(body.poll_interval_hours))
    if body.poll_enabled is not None:
        set_setting("poll_enabled", "true" if body.poll_enabled else "false")
    if body.poll_interval_hours is not None or body.poll_enabled is not None:
        scheduler_mod.apply_poll_config()
    return _settings_read()


@app.post("/api/settings/test")
async def test_notification(body: TestNotification | None = None) -> dict:
    url = body.url.strip() if body and body.url and body.url.strip() else None
    ok = await asyncio.to_thread(
        send_notification,
        "USCIS Case Tracker test",
        "If you can read this, notifications work. 🎉",
        [url] if url else None,
    )
    if not ok:
        raise HTTPException(
            400,
            "That channel rejected the test."
            if url
            else "No channels configured, or all sends failed.",
        )
    return {"status": "sent"}


# ── Static SPA (mounted only when a build is present) ─────────────────────────
if os.path.isdir(STATIC_DIR):
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        root = os.path.abspath(STATIC_DIR)
        candidate = os.path.normpath(os.path.join(root, full_path))
        if full_path and candidate.startswith(root) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(root, "index.html"))
