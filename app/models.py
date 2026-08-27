"""SQLAlchemy models and the helpers that translate a USCIS fetch result into
database rows. Column names mirror the upstream payload (see Case)."""

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import Session, relationship

from app.database import Base


class Setting(Base):
    """Key-value app settings, editable at runtime (notification channels, etc.)."""

    __tablename__ = "settings"

    key   = Column(String(64), primary_key=True)
    value = Column(Text, nullable=True)


# Column names mirror the USCIS CaseStatusResponse / detailsEng fields
# (camelCase → snake_case) so DB, code, and the upstream payload stay aligned:
#   receiptNumber → receipt_number   isValid       → is_valid
#   formNum       → form_num         formTitle     → form_title
#   actionCodeText→ action_code_text actionCodeDesc→ action_code_desc
class Case(Base):
    __tablename__ = "cases"

    id               = Column(Integer, primary_key=True, index=True)
    receipt_number   = Column(String(20), unique=True, nullable=False, index=True)
    nickname         = Column(String(100), nullable=True)  # user-supplied, not a USCIS field
    is_valid         = Column(Boolean, nullable=True)
    form_num         = Column(String(20), nullable=True)
    form_title       = Column(Text, nullable=True)
    action_code_text = Column(Text, nullable=True)
    action_code_desc = Column(Text, nullable=True)
    is_finished      = Column(Boolean, default=False)  # derived: terminal status reached
    archived         = Column(Boolean, default=False)  # user-set: stop actively watching
    last_checked     = Column(DateTime, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    notify           = Column(Boolean, default=True)  # send notifications on change

    history = relationship(
        "StatusHistory",
        back_populates="case",
        order_by="StatusHistory.recorded_at.desc()",
        cascade="all, delete-orphan",
    )


class StatusHistory(Base):
    __tablename__ = "status_history"

    id               = Column(Integer, primary_key=True, index=True)
    case_id          = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    action_code_text = Column(Text, nullable=False)
    action_code_desc = Column(Text, nullable=True)
    recorded_at      = Column(DateTime, default=datetime.utcnow)
    source           = Column(String(20), default="auto")  # "auto" | "manual"

    case = relationship("Case", back_populates="history")


def apply_result(case: Case, result: dict) -> None:
    """Copy USCIS-aligned fields from a fetch_case_status result onto a Case."""
    from app.uscis import is_terminal_status

    case.action_code_text = result["action_code_text"]
    case.action_code_desc = result.get("action_code_desc")
    case.form_num = result.get("form_num")
    case.form_title = result.get("form_title")
    case.is_valid = result.get("is_valid")
    case.is_finished = is_terminal_status(result["action_code_text"])
    case.last_checked = datetime.utcnow()


def history_entry(case: Case, result: dict, source: str) -> StatusHistory:
    """Build a StatusHistory row from a fetch_case_status result."""
    return StatusHistory(
        case_id=case.id,
        action_code_text=result["action_code_text"],
        action_code_desc=result.get("action_code_desc"),
        source=source,
    )


def record_result(db: Session, case: Case, result: dict, source: str) -> tuple[bool, str | None]:
    """
    Apply a fetch result to ``case``, appending a history row only when the status
    actually changed, then commit. Returns ``(changed, previous_status)`` so the
    caller can craft a message or fire a notification.
    """
    previous = case.action_code_text
    changed = result["action_code_text"] != previous
    apply_result(case, result)
    if changed:
        db.add(history_entry(case, result, source))
    db.commit()
    return changed, previous
