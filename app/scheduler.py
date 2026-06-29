"""In-process APScheduler that polls active cases on a configurable interval."""

import asyncio
import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.database import SessionLocal
from app.models import Case, record_result
from app.notify import notify_status_change
from app.settings_store import get_poll_interval_hours
from app.uscis import fetch_case_status

logger = logging.getLogger(__name__)

_PER_CASE_DELAY_SECONDS = 2
_JOB_ID = "poll_all_cases"

_scheduler: AsyncIOScheduler | None = None


async def _poll_all_cases() -> None:
    db = SessionLocal()
    try:
        # Skip finished cases — their status is terminal and won't change.
        snapshot = [
            (c.id, c.receipt_number)
            for c in db.query(Case).filter(Case.is_finished.isnot(True)).all()
        ]
        finished = db.query(Case).filter(Case.is_finished.is_(True)).count()
    finally:
        db.close()

    logger.info("Polling %d active case(s); skipping %d finished", len(snapshot), finished)

    for case_id, receipt in snapshot:
        try:
            result = await fetch_case_status(receipt)
        except Exception as e:
            logger.warning("Fetch error for %s: %s", receipt, e)
            result = None

        db = SessionLocal()
        try:
            case = db.get(Case, case_id)
            if case is None:
                continue
            if result:
                changed, old = record_result(db, case, result, "auto")
                if changed and case.notify:
                    label = case.nickname or case.receipt_number
                    await asyncio.to_thread(
                        notify_status_change, label, case.receipt_number, old,
                        result["action_code_text"], case.action_code_desc,
                    )
            else:
                case.last_checked = datetime.utcnow()
                db.commit()
        except Exception as e:
            logger.error("DB error for %s: %s", receipt, e)
            db.rollback()
        finally:
            db.close()

        await asyncio.sleep(_PER_CASE_DELAY_SECONDS)


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    hours = get_poll_interval_hours()
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _poll_all_cases, trigger=IntervalTrigger(hours=hours),
        id=_JOB_ID, replace_existing=True, misfire_grace_time=300,
    )
    _scheduler.start()
    logger.info("Scheduler started — polling every %sh", hours)
    return _scheduler


def reschedule(hours: float) -> None:
    if _scheduler is not None:
        _scheduler.reschedule_job(_JOB_ID, trigger=IntervalTrigger(hours=hours))
        logger.info("Scheduler rescheduled — polling every %sh", hours)


def shutdown() -> None:
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
