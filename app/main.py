"""USCIS Case Tracker — self-hosted JSON API + static SPA host."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app import scheduler as scheduler_mod
from app.database import get_db, init_db
from app.models import Case, StatusHistory, record_result
from app.notify import notify_status_change, send_notification
from app.schemas import (
    CaseCreate,
    CaseEventRead,
    CaseRead,
    CaseUpdate,
    SettingsRead,
    SettingsUpdate,
)
from app.settings_store import get_apprise_urls, get_poll_interval_hours, set_setting
from app.uscis import fetch_case_status, validate_receipt_number

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
    yield
    scheduler_mod.shutdown()


app = FastAPI(title="USCIS Case Tracker", lifespan=lifespan)


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


@app.post("/api/cases", response_model=CaseRead, status_code=201)
async def add_case(body: CaseCreate, db: Session = Depends(get_db)) -> CaseRead:
    receipt = body.receipt_number.strip().upper()
    if not validate_receipt_number(receipt):
        raise HTTPException(422, "Invalid receipt number (expected 3 letters + 10 digits)")
    if db.query(Case).filter(Case.receipt_number == receipt).first():
        raise HTTPException(409, f"Case {receipt} is already tracked")

    case = Case(receipt_number=receipt, nickname=(body.nickname or "").strip() or None, notify=body.notify)
    db.add(case)
    db.commit()
    db.refresh(case)

    result = await fetch_case_status(receipt)
    if result:
        record_result(db, case, result, "manual")
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
    db.commit()
    db.refresh(case)
    return CaseRead.from_model(case)


@app.delete("/api/cases/{case_id}", status_code=204)
async def delete_case(case_id: int, db: Session = Depends(get_db)) -> None:
    case = _get_case_or_404(db, case_id)
    db.delete(case)
    db.commit()


@app.post("/api/cases/{case_id}/refresh", response_model=CaseRead)
async def refresh_case(case_id: int, db: Session = Depends(get_db)) -> CaseRead:
    case = _get_case_or_404(db, case_id)
    result = await fetch_case_status(case.receipt_number)
    if not result:
        raise HTTPException(502, f"Could not fetch status for {case.receipt_number}")
    record_result(db, case, result, "manual")
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


@app.get("/api/settings", response_model=SettingsRead)
async def get_settings() -> SettingsRead:
    return SettingsRead(
        apprise_urls=get_apprise_urls(), poll_interval_hours=get_poll_interval_hours()
    )


@app.put("/api/settings", response_model=SettingsRead)
async def update_settings(body: SettingsUpdate) -> SettingsRead:
    set_setting("apprise_urls", "\n".join(u.strip() for u in body.apprise_urls if u.strip()))
    set_setting("poll_interval_hours", str(body.poll_interval_hours))
    scheduler_mod.reschedule(body.poll_interval_hours)
    return SettingsRead(
        apprise_urls=get_apprise_urls(), poll_interval_hours=get_poll_interval_hours()
    )


@app.post("/api/settings/test")
async def test_notification() -> dict:
    ok = await asyncio.to_thread(
        send_notification, "USCIS Tracker test", "If you can read this, notifications work. 🎉"
    )
    if not ok:
        raise HTTPException(400, "No channels configured, or all sends failed")
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
