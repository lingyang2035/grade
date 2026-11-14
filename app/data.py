"""数据库快照序列化与只读演示数据。

接口统一返回“当前家庭快照”，前端不需要自行拼装跨表数据；演示数据也使用同一
结构，保证演示与正式页面的渲染逻辑完全一致。
"""

from __future__ import annotations

from copy import deepcopy

from .domain import (
    APP_VERSION,
    EXAM_KINDS,
    EXAM_KIND_LABELS,
    EXAM_SCOPES,
    EXAM_SCOPE_LABELS,
    GRADES,
    MOCK_SUBJECT_MAX,
    RETEST_TYPES,
    SCORE_MAX_TEMPLATES,
    SCORE_STATUSES,
    SUBJECTS,
    SUBJECT_MAX,
    exam_total,
    local_today,
    rank_share,
)

DEMO_PROFILE = {"studentName": "示例学生", "grade": "初二", "className": "2 班"}
DEMO_COHORT = {"classCount": 42, "gradeCount": 420}
DEMO_TARGET = 150
DEMO_SUBJECT_TARGETS = {
    "chinese": 85,
    "math": 85,
    "english": 90,
    "physics": 80,
    "chemistry": 85,
    "civics": 85,
    "history": 85,
    "interdisciplinary": 80,
    "sports": 90,
}
DEMO_ROWS = [
    ("2026-09-08", "开学摸底", 19, 182, [109, 103, 121, 41, None, 36, 37, None, None]),
    ("2026-09-24", "9 月月考", 16, 159, [114, 108, 124, 42, None, 38, 38, 11, None]),
    ("2026-10-09", "全科模拟一", 17, 167, [113, 110, 123, 51, 38, 45, 45, 11, 24]),
    ("2026-10-23", "全科模拟二", 14, 138, [116, 113, 130, 54, 41, 47, 48, 12, 25]),
    ("2026-11-06", "全科模拟三", 12, 124, [120, 108, 134, 58, 44, 49, 50, 12, 26]),
]
DEMO_EVIDENCE = [
    {"id": "demo-e1", "examId": "demo-3", "subject": "math", "topic": "一次函数", "skill": "建模", "questionType": "解答题", "question": "第 21 题", "score": 4, "max": 8, "reason": "漏写变量之间的关系，后续列式用错条件。"},
    {"id": "demo-e2", "examId": "demo-4", "subject": "math", "topic": "一次函数", "skill": "建模", "questionType": "解答题", "question": "第 23 题", "score": 5, "max": 10, "reason": "能读懂题意，但漏写了两个变量的关系。"},
    {"id": "demo-e3", "examId": "demo-4", "subject": "math", "topic": "三角形全等", "skill": "推理证明", "questionType": "证明题", "question": "第 24 题", "score": 5, "max": 8, "reason": "结论正确，漏写了证明三角形全等的依据。"},
    {"id": "demo-e4", "examId": "demo-4", "subject": "physics", "topic": "运动图像", "skill": "图表信息提取", "questionType": "解答题", "question": "第 14 题", "score": 3, "max": 5, "reason": "没有核对纵轴单位。"},
    {"id": "demo-e5", "examId": "demo-2", "subject": "math", "topic": "一次函数", "skill": "图像识读", "questionType": "选择题", "question": "第 8 题", "score": 4, "max": 4, "reason": ""},
    {"id": "demo-e6", "examId": "demo-3", "subject": "math", "topic": "三角形全等", "skill": "推理证明", "questionType": "证明题", "question": "第 22 题", "score": 8, "max": 8, "reason": ""},
    {"id": "demo-e7", "examId": "demo-4", "subject": "math", "topic": "整式运算", "skill": "计算", "questionType": "填空题", "question": "第 12 题", "score": 4, "max": 4, "reason": ""},
]
DEMO_TASKS = [
    {"id": "demo-t1", "evidenceId": "demo-e2", "title": "独立做 3 道一次函数建模新题", "plan": "先写出两个变量和它们的关系，再列式。用没做过的题验证。", "due": "2026-11-12", "result": None},
    {"id": "demo-t2", "evidenceId": "demo-e4", "title": "复练物理图表读数", "plan": "做题前检查横轴、纵轴和单位。", "due": "2026-11-08", "result": {"correct": 2, "total": 3, "hints": False, "note": "读数都正确，还需检查单位换算。"}},
    {"id": "demo-t3", "evidenceId": "demo-e1", "title": "重做一次函数建模原题", "due": "2026-10-26", "plan": "", "result": {"correct": 1, "total": 1, "questionSet": "original", "date": "2026-10-26", "hints": True, "note": "提醒先列两个变量的关系后完成。"}},
    {"id": "demo-t4", "evidenceId": "demo-e2", "title": "用新题验证函数建模", "due": "2026-11-08", "plan": "", "result": {"correct": 2, "total": 3, "questionSet": "new", "date": "2026-11-08", "hints": False, "note": "还需要核对分段条件。"}},
]


def _exam_json(exam: dict) -> dict:
    scores = dict(exam.get("scores") or {})
    total = exam_total(scores, exam["kind"])
    exam["total"] = total
    exam["classShare"] = rank_share(exam.get("classRank"), exam.get("classCount"))
    exam["gradeShare"] = rank_share(exam.get("gradeRank"), exam.get("gradeCount"))
    return exam


def _build_demo() -> dict:
    exams = []
    for index, (exam_date, name, class_rank, grade_rank, points) in enumerate(DEMO_ROWS):
        full_mock = all(point is not None for point in points)
        scores = {}
        for subject, point in zip(SUBJECTS, points):
            if point is None:
                continue
            subject_id = subject["id"]
            max_score = MOCK_SUBJECT_MAX[subject_id] if full_mock else subject["max"]
            scores[subject_id] = {"score": float(point), "max": float(max_score)}
        exam = {
            "id": f"demo-{index}",
            "name": name,
            "date": exam_date,
            "kind": "zhongkaoMock" if full_mock else "stage",
            "scope": "school",
            "classRank": class_rank,
            "gradeRank": grade_rank,
            "classCount": DEMO_COHORT["classCount"],
            "gradeCount": DEMO_COHORT["gradeCount"],
            "note": "",
            "orgName": "",
            "scores": scores,
            "scoreStatuses": {},
            "createdAt": f"{exam_date}T00:00:00+08:00",
            "updatedAt": f"{exam_date}T00:00:00+08:00",
        }
        exams.append(_exam_json(exam))
    return {
        "family": None,
        "profile": deepcopy(DEMO_PROFILE),
        "cohort": deepcopy(DEMO_COHORT),
        "target": DEMO_TARGET,
        "subjectTargets": deepcopy(DEMO_SUBJECT_TARGETS),
        "scoreMaxima": deepcopy(SCORE_MAX_TEMPLATES),
        "exams": exams,
        "evidence": deepcopy(DEMO_EVIDENCE),
        "tasks": deepcopy(DEMO_TASKS),
    }


DEMO = _build_demo()


def demo_snapshot() -> dict:
    return deepcopy(DEMO)


def _row_value(row, key, default=None):
    return row[key] if row is not None and key in row.keys() else default


def _evidence_json(row) -> dict:
    return {
        "id": row["id"],
        "examId": row["exam_id"],
        "subject": row["subject_id"],
        "topic": row["topic"],
        "skill": row["skill"],
        "questionType": row["question_type"],
        "question": row["question"],
        "score": row["score"],
        "max": row["max_score"],
        "reason": row["reason"],
    }


def _task_json(row) -> dict:
    result = None
    if row["result_correct"] is not None:
        result = {
            "correct": row["result_correct"],
            "total": row["result_total"],
            "questionSet": row["result_question_set"] or "",
            "date": row["result_date"] or "",
            "hints": bool(row["result_hints"]),
            "note": row["result_note"],
            "recordedAt": row["result_recorded_at"],
        }
    return {
        "id": row["id"],
        "evidenceId": row["evidence_id"],
        "title": row["title"],
        "plan": row["plan"],
        "due": row["due_date"],
        "result": result,
    }


def family_snapshot(db, family_id: str) -> dict:
    family = db.execute("SELECT id, name FROM families WHERE id = ?", (family_id,)).fetchone()
    if family is None:
        raise ValueError("家庭不存在。")
    profile = db.execute(
        "SELECT student_name, grade, class_name FROM family_profiles WHERE family_id = ?",
        (family_id,),
    ).fetchone()
    settings = db.execute(
        "SELECT class_count, grade_count, grade_target FROM family_settings WHERE family_id = ?",
        (family_id,),
    ).fetchone()
    targets = db.execute(
        "SELECT subject_id, target_rate FROM subject_targets WHERE family_id = ?",
        (family_id,),
    ).fetchall()
    score_maxima = deepcopy(SCORE_MAX_TEMPLATES)
    for row in db.execute(
        "SELECT template, subject_id, max_score FROM score_maxima WHERE family_id = ?",
        (family_id,),
    ):
        if row["template"] in score_maxima and row["subject_id"] in score_maxima[row["template"]]:
            score_maxima[row["template"]][row["subject_id"]] = row["max_score"]

    exam_rows = db.execute(
        """
        SELECT e.*, s.subject_id, s.score, s.max_score, s.status
        FROM exams e
        LEFT JOIN exam_subjects s ON s.exam_id = e.id
        WHERE e.family_id = ?
        ORDER BY e.exam_date, e.created_at, e.id, s.subject_id
        """,
        (family_id,),
    ).fetchall()
    exams = []
    grouped = {}
    for row in exam_rows:
        exam_id = row["id"]
        if exam_id not in grouped:
            exam = {
                "id": exam_id,
                "name": row["name"],
                "date": row["exam_date"],
                "kind": row["kind"],
                "scope": row["scope"],
                "classRank": row["class_rank"],
                "gradeRank": row["grade_rank"],
                "classCount": row["class_count"],
                "gradeCount": row["grade_count"],
                "note": row["note"],
                "orgName": row["org_name"],
                "scores": {},
                "scoreStatuses": {},
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
            grouped[exam_id] = exam
            exams.append(exam)
        if row["subject_id"] is None:
            continue
        if row["status"]:
            grouped[exam_id]["scoreStatuses"][row["subject_id"]] = row["status"]
        else:
            grouped[exam_id]["scores"][row["subject_id"]] = {
                "score": row["score"],
                "max": row["max_score"],
            }
    for exam in exams:
        _exam_json(exam)

    evidence = [
        _evidence_json(row)
        for row in db.execute(
            "SELECT * FROM evidence WHERE family_id = ? ORDER BY created_at, id",
            (family_id,),
        ).fetchall()
    ]
    tasks = [
        _task_json(row)
        for row in db.execute(
            "SELECT * FROM tasks WHERE family_id = ? ORDER BY created_at, id",
            (family_id,),
        ).fetchall()
    ]
    return {
        "family": {"id": family["id"], "name": family["name"]},
        "profile": {
            "studentName": _row_value(profile, "student_name", ""),
            "grade": _row_value(profile, "grade", ""),
            "className": _row_value(profile, "class_name", ""),
        },
        "cohort": {
            "classCount": _row_value(settings, "class_count"),
            "gradeCount": _row_value(settings, "grade_count"),
        },
        "target": _row_value(settings, "grade_target"),
        "subjectTargets": {row["subject_id"]: row["target_rate"] for row in targets},
        "scoreMaxima": score_maxima,
        "exams": exams,
        "evidence": evidence,
        "tasks": tasks,
    }


def user_json(row, family_name: str | None = None) -> dict:
    if family_name is None:
        family_name = ""
    return {
        "id": row["id"],
        "username": row["username"],
        "name": row["display_name"],
        "isAdmin": bool(row["is_admin"]),
        "active": bool(row["active"]),
        "familyId": row["family_id"],
        "familyName": family_name,
        "mustChangePassword": bool(row["must_change_password"]),
    }


def admin_snapshot(db) -> dict:
    families = []
    for row in db.execute(
        """
        SELECT f.id, f.name, f.created_at, p.student_name, p.grade, p.class_name,
               (SELECT COUNT(*) FROM users u WHERE u.family_id = f.id) AS account_count
        FROM families f
        LEFT JOIN family_profiles p ON p.family_id = f.id
        ORDER BY f.created_at, f.id
        """
    ).fetchall():
        families.append(
            {
                "id": row["id"],
                "name": row["name"],
                "studentName": row["student_name"] or "",
                "grade": row["grade"] or "",
                "className": row["class_name"] or "",
                "accountCount": row["account_count"],
                "createdAt": row["created_at"],
            }
        )
    accounts = []
    for row in db.execute(
        """
        SELECT u.*, f.name AS family_name
        FROM users u
        JOIN families f ON f.id = u.family_id
        ORDER BY f.created_at, u.created_at, u.id
        """
    ).fetchall():
        account = user_json(row, row["family_name"])
        account["createdAt"] = row["created_at"]
        accounts.append(account)
    return {"families": families, "accounts": accounts}


def meta_json() -> dict:
    return {
        "version": APP_VERSION,
        "subjects": SUBJECTS,
        "subjectMax": SUBJECT_MAX,
        "mockSubjectMax": MOCK_SUBJECT_MAX,
        "mockTotalMax": sum(MOCK_SUBJECT_MAX.values()),
        "examKinds": EXAM_KINDS,
        "examKindLabels": EXAM_KIND_LABELS,
        "examScopes": EXAM_SCOPES,
        "examScopeLabels": EXAM_SCOPE_LABELS,
        "scoreStatuses": SCORE_STATUSES,
        "retestTypes": RETEST_TYPES,
        "grades": list(GRADES),
        "today": local_today().isoformat(),
    }
