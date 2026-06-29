"""Single-case fetch + record, shared by the scheduler and the API's background
refresh. Runs in its own DB session so it's safe to launch as a background task."""

import asyncio
import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import Case, record_result
from app.notify import notify_status_change
from app.uscis import fetch_case_status

logger = logging.getLogger(__name__)


async def refresh_case(case_id: int, source: str = "manual") -> None:
    db = SessionLocal()
    try:
        case = db.get(Case, case_id)
        receipt = case.receipt_number if case else None
    finally:
        db.close()
    if not receipt:
        return

    try:
        result = await fetch_case_status(receipt)
    except Exception as e:
        logger.warning("Fetch error for %s: %s", receipt, e)
        result = None

    db = SessionLocal()
    try:
        case = db.get(Case, case_id)
        if case is None:
            return
        if result:
            changed, old = record_result(db, case, result, source)
            if changed and case.notify:
                label = case.nickname or case.receipt_number
                await asyncio.to_thread(
                    notify_status_change, label, case.receipt_number, old,
                    result["action_code_text"], case.action_code_desc,
                )
        else:
            # Still stamp last_checked so the UI's poll knows the attempt finished.
            case.last_checked = datetime.utcnow()
            db.commit()
    except Exception as e:
        logger.error("DB error for %s: %s", receipt, e)
        db.rollback()
    finally:
        db.close()
