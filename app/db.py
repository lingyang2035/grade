"""SQLite 连接与初始化。

每个请求使用独立连接（Waitress 多线程下不能共享 sqlite3.Connection）；
连接开启外键、WAL 与忙等待，保证家庭级联删除与并发读写行为明确。
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from flask import current_app, g


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        database = Path(current_app.config["DATABASE"])
        database.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(database, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA busy_timeout = 5000")
        g.db = connection
    return g.db


def close_db(_exception=None):
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def _migrate(connection: sqlite3.Connection) -> None:
    """按 schema 版本做最小迁移；schema.sql 的 CREATE IF NOT EXISTS 不会改旧表。"""
    version_row = connection.execute(
        "SELECT value FROM schema_meta WHERE key = 'version'"
    ).fetchone()
    version = int(version_row["value"]) if version_row else 1
    if version < 2:
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(exams)")}
        if "org_name" not in columns:
            connection.execute("ALTER TABLE exams ADD COLUMN org_name TEXT NOT NULL DEFAULT ''")
        connection.execute("UPDATE schema_meta SET value = '2' WHERE key = 'version'")
        version = 2
    if version < 3:
        # V0.2：去掉角色（重建 users），移除中考计分台账。
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}
        if "role" in columns:
            connection.executescript(
                """
                DROP INDEX IF EXISTS idx_one_student_per_family;
                DROP TABLE IF EXISTS users_v3;
                CREATE TABLE users_v3 (
                  id TEXT PRIMARY KEY,
                  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
                  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                  display_name TEXT NOT NULL,
                  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
                  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
                  password_hash TEXT NOT NULL,
                  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
                  session_version INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                INSERT INTO users_v3 (id, family_id, username, display_name, is_admin, active,
                                      password_hash, must_change_password, session_version,
                                      created_at, updated_at)
                  SELECT id, family_id, username, display_name, is_admin, active,
                         password_hash, must_change_password, session_version,
                         created_at, updated_at
                  FROM users;
                DROP TABLE users;
                ALTER TABLE users_v3 RENAME TO users;
                CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);
                """
            )
        connection.execute("DROP TABLE IF EXISTS ledger_entries")
        connection.execute("UPDATE schema_meta SET value = '3' WHERE key = 'version'")


def init_db():
    connection = get_db()
    schema_path = Path(__file__).with_name("schema.sql")
    connection.executescript(schema_path.read_text(encoding="utf-8"))
    _migrate(connection)
    connection.commit()


def init_app(app):
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()
