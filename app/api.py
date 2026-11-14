"""家庭学习数据的 JSON API。

所有写接口先经过 CSRF 与权限校验，再由 domain 层校验业务规则；任何写操作
成功后统一返回当前家庭的最新快照，前端不自行拼装跨表状态。
"""

from __future__ import annotations

import secrets
import sqlite3

from flask import Blueprint, g, jsonify, request, url_for

from .auth import admin_required, csrf_token, login_required
from .data import admin_snapshot, demo_snapshot, family_snapshot, meta_json, user_json
from .db import get_db
from .domain import (
    SCORE_MAX_TEMPLATES,
    now_iso,
    validate_cohort,
    validate_display_name,
    validate_evidence,
    validate_exam,
    validate_profile,
    validate_retest,
    validate_score_maxima,
    validate_subject_targets,
    validate_target,
    validate_task,
)
from .errors import ApiError

bp = Blueprint("api", __name__, url_prefix="/api")


# ---------------------------------------------------------------------------
# 通用助手
# ---------------------------------------------------------------------------


def _json() -> dict:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("请求格式不正确。")
    return payload


def _family_id() -> str:
    return g.user["family_id"]


def _family_response(db, message: str, **extra) -> dict:
    return {"data": family_snapshot(db, _family_id()), "message": message, **extra}


def _family_name(db) -> str:
    row = db.execute("SELECT name FROM families WHERE id = ?", (_family_id(),)).fetchone()
    return row["name"] if row else ""


def _require_exam(db, exam_id: str):
    row = db.execute(
        "SELECT * FROM exams WHERE id = ? AND family_id = ?",
        (exam_id, _family_id()),
    ).fetchone()
    if row is None:
        raise ApiError("考试不存在。", 404)
    return row


def _require_evidence(db, evidence_id: str):
    row = db.execute(
        "SELECT * FROM evidence WHERE id = ? AND family_id = ?",
        (evidence_id, _family_id()),
    ).fetchone()
    if row is None:
        raise ApiError("题目证据不存在。", 404)
    return row


def _require_task(db, task_id: str):
    row = db.execute(
        "SELECT * FROM tasks WHERE id = ? AND family_id = ?",
        (task_id, _family_id()),
    ).fetchone()
    if row is None:
        raise ApiError("练习不存在。", 404)
    return row


def _log_exam(db, action: str, exam_id: str, summary: str, detail: str = "") -> None:
    """最小审计：谁、何时、对哪场考试做了什么。"""
    db.execute(
        """
        INSERT INTO audit_logs(id, family_id, actor_user_id, actor_name, action,
                               target_type, target_id, summary, detail, created_at)
        VALUES (?, ?, ?, ?, ?, 'exam', ?, ?, ?, ?)
        """,
        (
            secrets.token_hex(16),
            _family_id(),
            g.user["id"],
            g.user["display_name"],
            action,
            exam_id,
            summary,
            detail,
            now_iso(),
        ),
    )


def _write_exam_subjects(db, exam_id: str, scores: dict, statuses: dict) -> None:
    db.execute("DELETE FROM exam_subjects WHERE exam_id = ?", (exam_id,))
    for subject_id, entry in scores.items():
        db.execute(
            "INSERT INTO exam_subjects(exam_id, subject_id, score, max_score, status) VALUES (?, ?, ?, ?, NULL)",
            (exam_id, subject_id, entry["score"], entry["max"]),
        )
    for subject_id, status in statuses.items():
        db.execute(
            "INSERT INTO exam_subjects(exam_id, subject_id, score, max_score, status) VALUES (?, ?, NULL, NULL, ?)",
            (exam_id, subject_id, status),
        )


# ---------------------------------------------------------------------------
# 启动快照
# ---------------------------------------------------------------------------


@bp.get("/bootstrap")
@login_required
def bootstrap():
    from flask import get_flashed_messages

    db = get_db()
    family_id = _family_id()
    data = family_snapshot(db, family_id)
    current = user_json(g.user, _family_name(db))
    admin = admin_snapshot(db) if current["isAdmin"] else None
    messages = get_flashed_messages()
    return jsonify(
        user=current,
        data=data,
        demo=demo_snapshot(),
        admin=admin,
        meta=meta_json(),
        csrfToken=csrf_token(),
        notice=" ".join(messages) if messages else "",
        urls={
            "logout": url_for("auth.logout"),
            "password": url_for("auth.password"),
        },
    )


# ---------------------------------------------------------------------------
# 审计日志
# ---------------------------------------------------------------------------

LOG_ACTION_LABELS = {
    "exam.create": "创建考试",
    "exam.update": "修改考试",
    "exam.delete": "删除考试",
}


@bp.get("/logs")
@login_required
def logs():
    """本家庭可见；管理员额外可见所有家庭的日志。"""
    db = get_db()
    sql = (
        "SELECT l.*, f.name AS family_name FROM audit_logs l "
        "JOIN families f ON f.id = l.family_id"
    )
    params: tuple = ()
    if not g.user["is_admin"]:
        sql += " WHERE l.family_id = ?"
        params = (_family_id(),)
    sql += " ORDER BY l.created_at DESC, l.rowid DESC LIMIT 100"
    return jsonify(
        logs=[
            {
                "id": row["id"],
                "familyId": row["family_id"],
                "familyName": row["family_name"],
                "actorName": row["actor_name"],
                "action": row["action"],
                "actionLabel": LOG_ACTION_LABELS.get(row["action"], row["action"]),
                "summary": row["summary"],
                "detail": row["detail"],
                "createdAt": row["created_at"],
            }
            for row in db.execute(sql, params).fetchall()
        ]
    )


# ---------------------------------------------------------------------------
# 考试
# ---------------------------------------------------------------------------


@bp.post("/exams")
@login_required
def create_exam():
    db = get_db()
    payload = _json()
    settings = db.execute(
        "SELECT class_count, grade_count FROM family_settings WHERE family_id = ?",
        (_family_id(),),
    ).fetchone()
    exam = validate_exam(
        payload,
        class_count=settings["class_count"] if settings else None,
        grade_count=settings["grade_count"] if settings else None,
    )
    exam_id = secrets.token_hex(16)
    now = now_iso()
    with db:
        db.execute(
            """
            INSERT INTO exams(id, family_id, name, exam_date, kind, scope, class_rank, grade_rank,
                              class_count, grade_count, note, org_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                exam_id,
                _family_id(),
                exam["name"],
                exam["date"],
                exam["kind"],
                exam["scope"],
                exam["class_rank"],
                exam["grade_rank"],
                exam["class_count"],
                exam["grade_count"],
                exam["note"],
                exam["org_name"],
                now,
                now,
            ),
        )
        _write_exam_subjects(db, exam_id, exam["scores"], exam["statuses"])
        _log_exam(
            db,
            "exam.create",
            exam_id,
            f"创建考试「{exam['name']}」",
            f"{exam['date']} · {len(exam['scores'])} 科有成绩",
        )
    return jsonify(_family_response(db, "考试已保存。", examId=exam_id))


@bp.put("/exams/<exam_id>")
@login_required
def update_exam(exam_id: str):
    db = get_db()
    existing = _require_exam(db, exam_id)
    payload = _json()
    exam = validate_exam(
        payload,
        class_count=existing["class_count"],
        grade_count=existing["grade_count"],
    )
    now = now_iso()
    with db:
        db.execute(
            """
            UPDATE exams
            SET name = ?, exam_date = ?, kind = ?, scope = ?, class_rank = ?, grade_rank = ?,
                note = ?, org_name = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                exam["name"],
                exam["date"],
                exam["kind"],
                exam["scope"],
                exam["class_rank"],
                exam["grade_rank"],
                exam["note"],
                exam["org_name"],
                now,
                exam_id,
            ),
        )
        _write_exam_subjects(db, exam_id, exam["scores"], exam["statuses"])
        _log_exam(
            db,
            "exam.update",
            exam_id,
            f"修改考试「{exam['name']}」",
            f"{exam['date']} · {len(exam['scores'])} 科有成绩",
        )
    return jsonify(_family_response(db, "考试已更新。", examId=exam_id))


@bp.delete("/exams/<exam_id>")
@admin_required
def delete_exam(exam_id: str):
    db = get_db()
    exam = _require_exam(db, exam_id)
    with db:
        db.execute("DELETE FROM exams WHERE id = ? AND family_id = ?", (exam_id, _family_id()))
        _log_exam(
            db,
            "exam.delete",
            exam_id,
            f"删除考试「{exam['name']}」",
            f"{exam['exam_date']} · 仅管理员可删除",
        )
    return jsonify(_family_response(db, "考试已删除。"))


# ---------------------------------------------------------------------------
# 学习设置
# ---------------------------------------------------------------------------


@bp.put("/settings/profile")
@login_required
def update_profile():
    db = get_db()
    profile = validate_profile(_json())
    now = now_iso()
    with db:
        db.execute(
            """
            INSERT INTO family_profiles(family_id, student_name, grade, class_name, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(family_id) DO UPDATE SET
              student_name = excluded.student_name, grade = excluded.grade,
              class_name = excluded.class_name, updated_at = excluded.updated_at
            """,
            (_family_id(), profile["student_name"], profile["grade"], profile["class_name"], now),
        )
    return jsonify(_family_response(db, "学习档案已保存。"))


@bp.put("/settings/cohort")
@login_required
def update_cohort():
    db = get_db()
    cohort = validate_cohort(_json())
    now = now_iso()
    with db:
        db.execute(
            """
            INSERT INTO family_settings(family_id, class_count, grade_count, grade_target, updated_at)
            VALUES (?, ?, ?, NULL, ?)
            ON CONFLICT(family_id) DO UPDATE SET
              class_count = excluded.class_count, grade_count = excluded.grade_count,
              updated_at = excluded.updated_at
            """,
            (_family_id(), cohort["class_count"], cohort["grade_count"], now),
        )
    return jsonify(_family_response(db, "人数设置已保存，只影响之后录入的新考试。"))


@bp.put("/settings/target")
@login_required
def update_target():
    db = get_db()
    target = validate_target(_json())
    now = now_iso()
    with db:
        db.execute(
            """
            INSERT INTO family_settings(family_id, class_count, grade_count, grade_target, updated_at)
            VALUES (?, NULL, NULL, ?, ?)
            ON CONFLICT(family_id) DO UPDATE SET
              grade_target = excluded.grade_target, updated_at = excluded.updated_at
            """,
            (_family_id(), target, now),
        )
    return jsonify(_family_response(db, "阶段目标已更新。"))


@bp.put("/settings/subject-targets")
@login_required
def update_subject_targets():
    db = get_db()
    targets = validate_subject_targets(_json())
    with db:
        db.execute("DELETE FROM subject_targets WHERE family_id = ?", (_family_id(),))
        for subject_id, rate in targets.items():
            db.execute(
                "INSERT INTO subject_targets(family_id, subject_id, target_rate) VALUES (?, ?, ?)",
                (_family_id(), subject_id, rate),
            )
    return jsonify(_family_response(db, "各科目标已更新。"))


@bp.put("/settings/score-maxima/<template>")
@login_required
def update_score_maxima(template: str):
    db = get_db()
    if template not in SCORE_MAX_TEMPLATES:
        raise ApiError("满分设置类型不存在。", 404)
    maxima = validate_score_maxima(_json())
    with db:
        db.execute(
            "DELETE FROM score_maxima WHERE family_id = ? AND template = ?",
            (_family_id(), template),
        )
        for subject_id, value in maxima.items():
            db.execute(
                "INSERT INTO score_maxima(family_id, template, subject_id, max_score) VALUES (?, ?, ?, ?)",
                (_family_id(), template, subject_id, value),
            )
    label = "平时考试" if template == "regular" else "中考"
    return jsonify(_family_response(db, f"{label}满分已保存，只影响之后录入的新考试。"))


# ---------------------------------------------------------------------------
# 题目证据
# ---------------------------------------------------------------------------


@bp.post("/evidence")
@login_required
def create_evidence():
    db = get_db()
    payload = _json()
    exam = _require_exam(db, str(payload.get("examId") or ""))
    evidence = validate_evidence(payload)
    evidence_id = secrets.token_hex(16)
    now = now_iso()
    try:
        with db:
            db.execute(
                """
                INSERT INTO evidence(id, family_id, exam_id, subject_id, topic, skill, question_type,
                                     question, question_key, score, max_score, reason, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    evidence_id,
                    _family_id(),
                    exam["id"],
                    evidence["subject_id"],
                    evidence["topic"],
                    evidence["skill"],
                    evidence["question_type"],
                    evidence["question"],
                    evidence["question_key"],
                    evidence["score"],
                    evidence["max_score"],
                    evidence["reason"],
                    now,
                    now,
                ),
            )
    except sqlite3.IntegrityError as exc:
        raise ApiError("这场考试已经记录过这道题，请从原记录编辑。") from exc
    return jsonify(_family_response(db, "题目证据已保存。", evidenceId=evidence_id))


@bp.put("/evidence/<evidence_id>")
@login_required
def update_evidence(evidence_id: str):
    db = get_db()
    _require_evidence(db, evidence_id)
    evidence = validate_evidence(_json())
    now = now_iso()
    try:
        # 保持题目所属考试不变；前端误传的 examId 不接受。
        with db:
            db.execute(
                """
                UPDATE evidence
                SET subject_id = ?, topic = ?, skill = ?, question_type = ?, question = ?,
                    question_key = ?, score = ?, max_score = ?, reason = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    evidence["subject_id"],
                    evidence["topic"],
                    evidence["skill"],
                    evidence["question_type"],
                    evidence["question"],
                    evidence["question_key"],
                    evidence["score"],
                    evidence["max_score"],
                    evidence["reason"],
                    now,
                    evidence_id,
                ),
            )
    except sqlite3.IntegrityError as exc:
        raise ApiError("这场考试已经记录过这道题，请从原记录编辑。") from exc
    return jsonify(_family_response(db, "题目证据已更新。"))


# ---------------------------------------------------------------------------
# 练习与复测
# ---------------------------------------------------------------------------


@bp.post("/tasks")
@login_required
def create_task():
    db = get_db()
    task = validate_task(_json())
    if task["evidence_id"]:
        _require_evidence(db, task["evidence_id"])
    task_id = secrets.token_hex(16)
    now = now_iso()
    with db:
        db.execute(
            """
            INSERT INTO tasks(id, family_id, evidence_id, title, plan, due_date, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                _family_id(),
                task["evidence_id"],
                task["title"],
                task["plan"],
                task["due_date"],
                now,
                now,
            ),
        )
    return jsonify(_family_response(db, "练习已加入本周行动。", taskId=task_id))


@bp.put("/tasks/<task_id>/result")
@login_required
def update_task_result(task_id: str):
    db = get_db()
    _require_task(db, task_id)
    result = validate_retest(_json())
    now = now_iso()
    with db:
        db.execute(
            """
            UPDATE tasks
            SET result_correct = ?, result_total = ?, result_question_set = ?, result_date = ?,
                result_hints = ?, result_note = ?, result_recorded_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                result["correct"],
                result["total"],
                result["question_set"] or None,
                result["result_date"] or None,
                1 if result["hints"] else 0,
                result["note"],
                now,
                now,
                task_id,
            ),
        )
    return jsonify(_family_response(db, "复测结果已记录。"))


# ---------------------------------------------------------------------------
# 当前账号
# ---------------------------------------------------------------------------


@bp.patch("/account")
@login_required
def update_account():
    db = get_db()
    name = validate_display_name(_json().get("name"))
    with db:
        db.execute(
            "UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?",
            (name, now_iso(), g.user["id"]),
        )
        row = db.execute("SELECT * FROM users WHERE id = ?", (g.user["id"],)).fetchone()
    return jsonify(user=user_json(row, _family_name(db)), message="称呼已保存。")
