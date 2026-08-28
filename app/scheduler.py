"""In-process APScheduler: polls active cases, and keeps the CF session warm."""

import asyncio
import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.database import SessionLocal
from app.models import Case
from app.poller import refresh_case
from app.settings_store import get_poll_enabled, get_poll_interval_hours
from app.uscis import CF_SESSION_TTL, warm_session

logger = logging.getLogger(__name__)

_PER_CASE_DELAY_SECONDS = 2
_POLL_JOB_ID = "poll_all_cases"
_WARM_JOB_ID = "cf_keepalive"
# Keep the Cloudflare session warm so manual refreshes skip the slow cold solve.
_KEEPALIVE = os.environ.get("CF_KEEPALIVE", "true").lower() == "true"

_scheduler: AsyncIOScheduler | None = None


def _active_case_ids() -> list[int]:
    """Cases the scheduler keeps polling: everything the user hasn't archived.
    A terminal-looking status no longer stops the checks — only the user can."""
    db = SessionLocal()
    try:
        return [c.id for c in db.query(Case).filter(Case.archived.isnot(True)).all()]
    finally:
        db.close()


async def _poll_all_cases() -> None:
    ids = _active_case_ids()
    logger.info("Polling %d active case(s)", len(ids))
    for case_id in ids:
        await refresh_case(case_id, "auto")
        await asyncio.sleep(_PER_CASE_DELAY_SECONDS)


async def _keepalive() -> None:
    # Only burn a Chrome solve while there are active cases worth checking.
    if _active_case_ids():
        await warm_session(force=True)


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.start()
    apply_poll_config()
    return _scheduler


def apply_poll_config() -> None:
    """Reconcile the poll (and CF-keepalive) jobs with the current settings —
    called at startup and whenever the polling settings change."""
    if _scheduler is None:
        return
    if not get_poll_enabled():
        for jid in (_POLL_JOB_ID, _WARM_JOB_ID):
            if _scheduler.get_job(jid):
                _scheduler.remove_job(jid)
        logger.info("Automatic checks OFF — cases are only checked on manual refresh")
        return

    hours = get_poll_interval_hours()
    _scheduler.add_job(
        _poll_all_cases, IntervalTrigger(hours=hours),
        id=_POLL_JOB_ID, replace_existing=True, misfire_grace_time=300,
    )
    if _KEEPALIVE:
        warm_interval = max(60, CF_SESSION_TTL - 120)  # renew just before TTL expiry
        _scheduler.add_job(
            _keepalive, IntervalTrigger(seconds=warm_interval),
            id=_WARM_JOB_ID, replace_existing=True,
        )
    logger.info("Automatic checks ON — every %sh%s", hours,
                " (CF keepalive on)" if _KEEPALIVE else "")


def shutdown() -> None:
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
