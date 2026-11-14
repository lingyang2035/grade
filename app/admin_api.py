"""管理员接口：家庭与账号管理。

管理员权限只允许管理账号/家庭资料，不提供任何跨家庭学习数据的读取入口。
"""

from __future__ import annotations

import secrets
import sqlite3

from flask import Blueprint, g, jsonify, request
from werkzeug.security import generate_password_hash

from .auth import admin_required
from .data import admin_snapshot
from .db import get_db
from .domain import now_iso, validate_account_identity, validate_family, validate_family_name
from .errors import ApiError

bp = Blueprint("admin_api", __name__, url_prefix="/api/admin")


def _json() -> dict:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("请求格式不正确。")
    return payload


def _require_family(family_id: str):
    row = get_db().execute("SELECT * FROM families WHERE id = ?", (family_id,)).fetchone()
    if row is None:
        raise ApiError("家庭不存在。", 404)
    return row


def _require_account(account_id: str):
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (account_id,)).fetchone()
    if row is None:
        raise ApiError("账号不存在。", 404)
    return row


def _response(message: str, **extra) -> dict:
    return {"data": admin_snapshot(get_db()), "message": message, **extra}


def _ensure_other_active_admin(db, exclude_id: str):
    if (
        db.execute(
            "SELECT 1 FROM users WHERE id != ? AND is_admin = 1 AND active = 1 LIMIT 1",
            (exclude_id,),
        ).fetchone()
        is None
    ):
        raise ApiError("至少保留一个启用的管理员账号。")


def _username_taken(db, username: str, exclude_id: str = "") -> bool:
    return (
        db.execute(
            "SELECT 1 FROM users WHERE username = ? AND id != ? LIMIT 1",
            (username, exclude_id),
        ).fetchone()
        is not None
    )


def _temp_password() -> str:
    return secrets.token_urlsafe(9)


@bp.get("")
@admin_required
def overview():
    return jsonify(data=admin_snapshot(get_db()))


@bp.post("/families")
@admin_required
def create_family():
    family = validate_family(_json())
    db = get_db()
    now = now_iso()
    family_id = secrets.token_hex(16)
    with db:
        db.execute(
            "INSERT INTO families(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (family_id, family["name"], now, now),
        )
        db.execute(
            "INSERT INTO family_profiles(family_id, student_name, grade, class_name, updated_at) VALUES (?, ?, ?, ?, ?)",
            (family_id, family["student_name"], family["grade"], family["class_name"], now),
        )
        db.execute(
            "INSERT INTO family_settings(family_id, class_count, grade_count, grade_target, updated_at) VALUES (?, NULL, NULL, NULL, ?)",
            (family_id, now),
        )
    return jsonify(_response("家庭已创建。", familyId=family_id))


@bp.patch("/families/<family_id>")
@admin_required
def update_family(family_id: str):
    _require_family(family_id)
    name = validate_family_name(_json())
    with get_db() as db:
        db.execute(
            "UPDATE families SET name = ?, updated_at = ? WHERE id = ?",
            (name, now_iso(), family_id),
        )
    return jsonify(_response("家庭名称已保存。学习档案由家长在学习设置中维护。"))


@bp.post("/accounts")
@admin_required
def create_account():
    account = validate_account_identity(_json())
    db = get_db()
    _require_family(account["family_id"])
    if _username_taken(db, account["username"]):
        raise ApiError("账号名已存在。")
    password = _temp_password()
    now = now_iso()
    account_id = secrets.token_hex(16)
    try:
        with db:
            db.execute(
                """
                INSERT INTO users(id, family_id, username, display_name, is_admin, active,
                                  password_hash, must_change_password, session_version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, 1, 0, ?, ?)
                """,
                (
                    account_id,
                    account["family_id"],
                    account["username"],
                    account["name"],
                    1 if account["is_admin"] else 0,
                    generate_password_hash(password),
                    now,
                    now,
                ),
            )
    except sqlite3.IntegrityError as exc:
        raise ApiError("账号名已存在。") from exc
    return jsonify(_response("账号已创建。", tempPassword=password, accountId=account_id))


@bp.patch("/accounts/<account_id>")
@admin_required
def update_account(account_id: str):
    existing = _require_account(account_id)
    account = validate_account_identity(_json())
    db = get_db()
    _require_family(account["family_id"])
    if _username_taken(db, account["username"], account_id):
        raise ApiError("账号名已存在。")
    if existing["active"] and existing["is_admin"] and not account["is_admin"]:
        _ensure_other_active_admin(db, account_id)
    now = now_iso()
    with db:
        db.execute(
            """
            UPDATE users
            SET family_id = ?, username = ?, display_name = ?, is_admin = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                account["family_id"],
                account["username"],
                account["name"],
                1 if account["is_admin"] else 0,
                now,
                account_id,
            ),
        )
    return jsonify(_response("账号资料已保存。"))


@bp.post("/accounts/<account_id>/toggle")
@admin_required
def toggle_account(account_id: str):
    existing = _require_account(account_id)
    if existing["id"] == g.user["id"]:
        raise ApiError("不能停用当前账号。")
    new_active = not bool(existing["active"])
    if existing["is_admin"] and existing["active"] and not new_active:
        _ensure_other_active_admin(get_db(), account_id)
    with get_db() as db:
        db.execute(
            "UPDATE users SET active = ?, updated_at = ? WHERE id = ?",
            (1 if new_active else 0, now_iso(), account_id),
        )
    return jsonify(_response("账号已启用。" if new_active else "账号已停用。"))


@bp.post("/accounts/<account_id>/reset-password")
@admin_required
def reset_password(account_id: str):
    existing = _require_account(account_id)
    if existing["id"] == g.user["id"]:
        raise ApiError("请在「我的」页面修改自己的密码。")
    password = _temp_password()
    with get_db() as db:
        db.execute(
            """
            UPDATE users
            SET password_hash = ?, must_change_password = 1,
                session_version = session_version + 1, updated_at = ?
            WHERE id = ?
            """,
            (generate_password_hash(password), now_iso(), account_id),
        )
    return jsonify(_response("密码已重置。", tempPassword=password))
