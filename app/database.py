"""Database engine, session factory, and the idempotent startup migration."""

import logging
import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:////app/data/uscis.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db():
    from app.models import Case, Setting, StatusHistory  # noqa: registers models with Base
    Base.metadata.create_all(bind=engine)
    _migrate_to_uscis_field_names()
    _migrate_notify_column()
    _migrate_archived_column()


def _migrate_notify_column():
    """Rename the legacy cases.notify_email column to notify (idempotent)."""
    insp = inspect(engine)
    if "cases" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("cases")}
    if "notify_email" in cols and "notify" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE cases RENAME COLUMN notify_email TO notify"))
            logger.info("Migrated cases.notify_email → notify")


def _migrate_archived_column():
    """Add cases.archived (user-set 'stop watching' flag). Idempotent."""
    insp = inspect(engine)
    if "cases" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("cases")}
    if "archived" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE cases ADD COLUMN archived BOOLEAN DEFAULT 0"))
            logger.info("Added column cases.archived")


def _migrate_to_uscis_field_names():
    """
    Bring pre-existing tables in line with the USCIS-aligned column names.
    create_all() never alters existing tables, so rename the legacy columns and
    add the new ones in place. Idempotent — safe to run on every startup.
    """
    insp = inspect(engine)
    if "cases" not in insp.get_table_names():
        return

    renames = {
        "cases": {"current_status": "action_code_text", "current_detail": "action_code_desc"},
        "status_history": {"status": "action_code_text", "detail": "action_code_desc"},
    }
    adds = {
        "cases": {
            "is_valid": "BOOLEAN", "form_num": "VARCHAR(20)", "form_title": "TEXT",
            "is_finished": "BOOLEAN",
        },
    }

    with engine.begin() as conn:
        for table, mapping in renames.items():
            cols = {c["name"] for c in insp.get_columns(table)}
            for old, new in mapping.items():
                if old in cols and new not in cols:
                    conn.execute(text(f'ALTER TABLE {table} RENAME COLUMN {old} TO {new}'))
                    logger.info(f"Migrated {table}.{old} → {new}")
        for table, mapping in adds.items():
            cols = {c["name"] for c in insp.get_columns(table)}
            for name, coltype in mapping.items():
                if name not in cols:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {name} {coltype}'))
                    logger.info(f"Added column {table}.{name}")

        # Backfill is_finished from each case's current status (derived, so always
        # safe to recompute on startup).
        from app.uscis import is_terminal_status
        rows = conn.execute(text("SELECT id, action_code_text FROM cases")).fetchall()
        for cid, action_code_text in rows:
            conn.execute(
                text("UPDATE cases SET is_finished = :finished WHERE id = :id"),
                {"finished": is_terminal_status(action_code_text), "id": cid},
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
