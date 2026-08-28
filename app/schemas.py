"""Pydantic request/response models for the JSON API."""

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.models import Case


def _utc_iso(dt: datetime | None) -> str | None:
    """Serialize a (naive) UTC datetime as an explicit-UTC ISO string so browsers
    localize it correctly instead of misreading it as local time."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class CaseCreate(BaseModel):
    receipt_number: str
    nickname: str | None = None
    notify: bool = True


class CaseUpdate(BaseModel):
    nickname: str | None = None
    notify: bool | None = None
    archived: bool | None = None


class CasePreview(BaseModel):
    """A one-off status lookup for a receipt number that is not tracked yet."""

    receipt_number: str
    status: str
    detail: str | None
    form_num: str | None
    form_title: str | None
    is_finished: bool


class CaseRead(BaseModel):
    id: int
    receipt_number: str
    nickname: str | None
    status: str | None
    detail: str | None
    form_num: str | None
    form_title: str | None
    is_valid: bool | None
    is_finished: bool
    archived: bool
    last_fetch_ok: bool
    last_checked: datetime | None
    notify: bool
    created_at: datetime

    @field_serializer("last_checked", "created_at")
    def _ser_dt(self, dt: datetime | None) -> str | None:
        return _utc_iso(dt)

    @classmethod
    def from_model(cls, c: Case) -> "CaseRead":
        return cls(
            id=c.id,
            receipt_number=c.receipt_number,
            nickname=c.nickname,
            status=c.action_code_text,
            detail=c.action_code_desc,
            form_num=c.form_num,
            form_title=c.form_title,
            is_valid=c.is_valid,
            is_finished=bool(c.is_finished),
            archived=bool(c.archived),
            last_fetch_ok=bool(c.last_fetch_ok) if c.last_fetch_ok is not None else True,
            last_checked=c.last_checked,
            notify=bool(c.notify),
            created_at=c.created_at,
        )


class CaseEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    action_code_text: str
    action_code_desc: str | None
    recorded_at: datetime
    source: str

    @field_serializer("recorded_at")
    def _ser_dt(self, dt: datetime) -> str | None:
        return _utc_iso(dt)


class SettingsRead(BaseModel):
    apprise_urls: list[str]
    poll_interval_hours: float


class SettingsUpdate(BaseModel):
    """Partial update — only the fields present are applied."""

    apprise_urls: list[str] | None = None
    poll_interval_hours: float | None = Field(default=None, gt=0)


class TestNotification(BaseModel):
    # If set, test just this one Apprise URL (even if not saved yet); otherwise
    # test every configured channel.
    url: str | None = None
