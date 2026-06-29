"""Notifications via Apprise — one config drives 100+ services (Telegram, Discord,
ntfy, Slack, email, Gotify, Matrix, webhooks, …). Users add their own channels."""

import logging

import apprise

from app.settings_store import get_apprise_urls

logger = logging.getLogger(__name__)


def send_notification(title: str, body: str) -> bool:
    """Send to every configured Apprise URL. Returns True if at least one succeeded.

    Synchronous (network I/O) — call via ``asyncio.to_thread`` from async code.
    """
    urls = get_apprise_urls()
    if not urls:
        logger.info("Notification skipped — no channels configured (title: %s)", title)
        return False
    client = apprise.Apprise()
    for url in urls:
        client.add(url)
    ok = client.notify(title=title, body=body)
    logger.info("Notification %s — %s", "sent" if ok else "FAILED", title)
    return bool(ok)


def notify_status_change(
    label: str, receipt: str, old_status: str | None, new_status: str, detail: str | None
) -> bool:
    title = f"USCIS Update: {label}"
    body = (
        f"{label} ({receipt})\n\n"
        f"{old_status or 'Unknown'}  →  {new_status}\n\n"
        f"{detail or ''}"
    ).strip()
    return send_notification(title, body)
