"""Pydantic request/response models for the JSON API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import Case


class CaseCreate(BaseModel):
    receipt_number: str
    nickname: str | None = None
    notify: bool = True


class CaseUpdate(BaseModel):
    nickname: str | None = None
    notify: bool | None = None


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
    last_checked: datetime | None
    notify: bool
    created_at: datetime

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


class SettingsRead(BaseModel):
    apprise_urls: list[str]
    poll_interval_hours: float


class SettingsUpdate(BaseModel):
    apprise_urls: list[str] = Field(default_factory=list)
    poll_interval_hours: float = Field(default=4.0, gt=0)
