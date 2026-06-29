"""Runtime app settings, persisted in the `settings` table with env fallbacks.

Lets users control notification channels and the poll interval from the UI without
touching env vars or restarting.
"""

import os

from app.database import SessionLocal
from app.models import Setting

# Env values seed the defaults on first run; the DB takes over once set in the UI.
_DEFAULTS = {
    "apprise_urls": os.environ.get("APPRISE_URLS", ""),
    "poll_interval_hours": os.environ.get("POLL_INTERVAL_HOURS", "4"),
}


def get_setting(key: str) -> str:
    db = SessionLocal()
    try:
        row = db.get(Setting, key)
        if row is not None and row.value is not None:
            return row.value
        return _DEFAULTS.get(key, "")
    finally:
        db.close()


def set_setting(key: str, value: str) -> None:
    db = SessionLocal()
    try:
        row = db.get(Setting, key)
        if row is None:
            db.add(Setting(key=key, value=value))
        else:
            row.value = value
        db.commit()
    finally:
        db.close()


def get_apprise_urls() -> list[str]:
    raw = get_setting("apprise_urls")
    return [u.strip() for u in raw.replace(",", "\n").splitlines() if u.strip()]


def get_poll_interval_hours() -> float:
    try:
        return max(0.1, float(get_setting("poll_interval_hours")))
    except ValueError:
        return 4.0
