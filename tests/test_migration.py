"""schema v1 → v2：旧库缺少 exams.org_name 时启动自动补列。"""

import sqlite3

from app import create_app


def test_old_database_gains_org_name_column(tmp_path):
    db_path = tmp_path / "old.db"
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO schema_meta(key, value) VALUES ('version', '1');
        CREATE TABLE exams (
          id TEXT PRIMARY KEY,
          family_id TEXT NOT NULL,
          name TEXT NOT NULL,
          exam_date TEXT NOT NULL,
          kind TEXT NOT NULL,
          scope TEXT NOT NULL,
          class_rank INTEGER,
          grade_rank INTEGER,
          class_count INTEGER,
          grade_count INTEGER,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO exams(id, family_id, name, exam_date, kind, scope, note, created_at, updated_at)
        VALUES ('old', 'f1', '旧考试', '2026-01-01', 'unit', 'school', '', '2026-01-01T00:00:00+08:00', '2026-01-01T00:00:00+08:00');
        """
    )
    connection.commit()
    connection.close()

    create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test",
            "DATA_DIR": str(tmp_path / "data"),
            "DATABASE": str(db_path),
            "SESSION_COOKIE_SECURE": False,
        }
    )

    connection = sqlite3.connect(db_path)
    columns = {row[1] for row in connection.execute("PRAGMA table_info(exams)")}
    assert "org_name" in columns
    assert connection.execute("SELECT org_name FROM exams WHERE id = 'old'").fetchone()[0] == ""
    assert connection.execute("SELECT value FROM schema_meta WHERE key = 'version'").fetchone()[0] == "3"
    connection.close()


def test_v2_database_drops_role_and_ledger(tmp_path):
    """V0.2：旧库的 users.role 与 ledger_entries 在启动时被移除，账号数据保留。"""
    db_path = tmp_path / "v2.db"
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO schema_meta(key, value) VALUES ('version', '2');
        CREATE TABLE families (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        INSERT INTO families VALUES ('f1', '家庭', '2026-01-01', '2026-01-01');
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          family_id TEXT NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
          username TEXT NOT NULL COLLATE NOCASE UNIQUE,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('parent', 'student')),
          is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          password_hash TEXT NOT NULL,
          must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
          session_version INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX idx_one_student_per_family ON users(family_id) WHERE role = 'student';
        INSERT INTO users VALUES ('u1', 'f1', 'admin', '管理员', 'parent', 1, 1, 'hash', 0, 3, '2026-01-01', '2026-01-01');
        CREATE TABLE ledger_entries (
          family_id TEXT NOT NULL,
          part_id TEXT NOT NULL,
          score REAL NOT NULL,
          PRIMARY KEY (family_id, part_id)
        );
        INSERT INTO ledger_entries VALUES ('f1', 'chinese', 150);
        """
    )
    connection.commit()
    connection.close()

    create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test",
            "DATA_DIR": str(tmp_path / "data"),
            "DATABASE": str(db_path),
            "SESSION_COOKIE_SECURE": False,
        }
    )

    connection = sqlite3.connect(db_path)
    columns = {row[1] for row in connection.execute("PRAGMA table_info(users)")}
    assert "role" not in columns
    row = connection.execute("SELECT username, is_admin, session_version FROM users WHERE id = 'u1'").fetchone()
    assert row == ("admin", 1, 3)
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert "ledger_entries" not in tables
    assert connection.execute("SELECT value FROM schema_meta WHERE key = 'version'").fetchone()[0] == "3"
    connection.close()
