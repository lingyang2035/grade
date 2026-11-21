"""Grade 领域常量与校验规则。

本模块不依赖 Flask/SQLite，服务端与接口共用同一套规则，避免前端或数据库层
各自维护一份“科目/满分/考试类型”。所有用户输入都应在进入数据库前经过这里。
"""

from __future__ import annotations

import math
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone


# 应用版本号（SSOT）：登录页与「我的」从同一处读取。
APP_VERSION = "V0.31"


class ValidationError(Exception):
    """可安全展示给用户的业务校验错误。"""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


# ---------------------------------------------------------------------------
# 学科与考试口径
# ---------------------------------------------------------------------------

SUBJECTS = [
    {
        "id": "chinese",
        "name": "语文",
        "max": 150,
        "optional": False,
        "action": "把失分按阅读、基础和作文拆开，先复盘失分最多的一类。",
    },
    {
        "id": "math",
        "name": "数学",
        "max": 150,
        "optional": False,
        "action": "把错题分成计算、审题和解法三类，隔两天独立重做。",
    },
    {
        "id": "english",
        "name": "英语",
        "max": 150,
        "optional": False,
        "action": "从试卷找出失分最多的题型，记录错因并做一组同类题。",
    },
    {
        "id": "physics",
        "name": "物理",
        "max": 70,
        "optional": False,
        "action": "从错题中找出一个易混概念，先用自己的话解释，再做同类题。",
    },
    {
        "id": "chemistry",
        "name": "化学",
        "max": 50,
        "optional": False,
        "action": "回看易混淆的概念与实验步骤，用一道同类题检验。",
    },
    {
        "id": "civics",
        "name": "道法",
        "max": 50,
        "optional": False,
        "action": "重做一道材料题，对照评分点补上漏写的依据和分析。",
    },
    {
        "id": "history",
        "name": "历史",
        "max": 50,
        "optional": False,
        "action": "给错题涉及的事件画一条时间线，再梳理因果关系。",
    },
    {
        "id": "interdisciplinary",
        "name": "跨学科",
        "max": 15,
        "optional": True,
        "action": "复盘资料题里漏掉的图表或文字线索。",
    },
    {
        "id": "sports",
        "name": "体育",
        "max": 30,
        "optional": True,
        "action": "按实测项目单独记录成绩，便于看同一项目的变化。",
    },
]
SUBJECT_IDS = tuple(subject["id"] for subject in SUBJECTS)
SUBJECT_BY_ID = {subject["id"]: subject for subject in SUBJECTS}
SUBJECT_MAX = {subject["id"]: subject["max"] for subject in SUBJECTS}

# 新考试的满分默认值。家庭在学习设置中保存自己的版本；正式中考计分结构
# 仍由 OFFICIAL_GROUPS / MOCK_SUBJECT_MAX 单独定义，不与录入模板混用。
SCORE_MAX_TEMPLATES = {
    "mock": {
        "chinese": 150,
        "math": 150,
        "english": 150,
        "physics": 80,
        "chemistry": 55,
        "civics": 60,
        "history": 60,
        "interdisciplinary": 15,
        "sports": 30,
    },
    "regular": {
        "chinese": 100,
        "math": 100,
        "english": 100,
        "physics": 70,
        "chemistry": 50,
        "civics": 30,
        "history": 30,
        "interdisciplinary": None,
        "sports": None,
    },
}

GRADES = ("预初", "初一", "初二", "初三")

# 新建考试可选的类型与范围（有序，表单按此展示）。旧记录的类型/范围保留原值展示，
# 编辑旧记录时可沿用或改为新版选项；校验同时接受新版与旧版值。
EXAM_KINDS = {
    "weekly": "周测 / 机构",
    "stage": "阶段测验 / 月考",
    "term": "期中 / 期末",
    "zhongkaoMock": "模拟中考",
}
EXAM_KIND_LABELS = {**EXAM_KINDS, "unit": "单元测验", "other": "其他"}
EXAM_SCOPES = {
    "class": "本班",
    "school": "本校",
    "district": "区级",
    "external": "校外机构",
}
EXAM_SCOPE_LABELS = {**EXAM_SCOPES, "joint": "校际联考", "other": "其他"}
VALID_EXAM_KINDS = set(EXAM_KIND_LABELS)
VALID_EXAM_SCOPES = set(EXAM_SCOPE_LABELS)
SCORE_STATUSES = {
    "untested": "本次未考",
    "pending": "待公布",
    "absent": "缺考",
}
RETEST_TYPES = {
    "original": "重做原题",
    "new": "同类新题",
    "mixed": "原题与新题混合",
}

# 2026 年上海中考计分模板。年度模板维护属于后续版本，当前固定使用这一份。
OFFICIAL_GROUPS = [
    {
        "name": "语文",
        "parts": [{"id": "chinese", "name": "笔试", "max": 150}],
    },
    {
        "name": "数学",
        "parts": [{"id": "math", "name": "笔试", "max": 150}],
    },
    {
        "name": "外语",
        "parts": [
            {"id": "englishWritten", "name": "笔试（含听力）", "max": 140},
            {"id": "englishSpeaking", "name": "听说测试", "max": 10},
        ],
    },
    {
        "name": "综合测试",
        "parts": [
            {"id": "physicsWritten", "name": "物理笔试", "max": 70},
            {"id": "chemistryWritten", "name": "化学笔试", "max": 50},
            {"id": "interdisciplinary", "name": "跨学科案例分析", "max": 15},
            {"id": "physicsLab", "name": "物理实验操作", "max": 10},
            {"id": "chemistryLab", "name": "化学实验操作", "max": 5},
        ],
    },
    {
        "name": "道德与法治",
        "parts": [
            {"id": "civicsWritten", "name": "统一开卷考试", "max": 30},
            {"id": "civicsDaily", "name": "日常考核", "max": 30},
        ],
    },
    {
        "name": "历史",
        "parts": [
            {"id": "historyWritten", "name": "统一开卷考试", "max": 30},
            {"id": "historyDaily", "name": "日常考核", "max": 30},
        ],
    },
    {
        "name": "体育与健身",
        "parts": [
            {"id": "sportsTest", "name": "统一测试", "max": 15},
            {"id": "sportsDaily", "name": "日常考核", "max": 15},
        ],
    },
]
OFFICIAL_PARTS = {
    part["id"]: part["max"]
    for group in OFFICIAL_GROUPS
    for part in group["parts"]
}
COMBINED_PARTS = {
    "english": ("englishWritten", "englishSpeaking"),
    "physics": ("physicsWritten", "physicsLab"),
    "chemistry": ("chemistryWritten", "chemistryLab"),
    "civics": ("civicsWritten", "civicsDaily"),
    "history": ("historyWritten", "historyDaily"),
    "sports": ("sportsTest", "sportsDaily"),
}
MOCK_SUBJECT_MAX = {
    subject["id"]: sum(OFFICIAL_PARTS[part_id] for part_id in COMBINED_PARTS.get(subject["id"], (subject["id"],)))
    for subject in SUBJECTS
}
MOCK_TOTAL_MAX = sum(MOCK_SUBJECT_MAX.values())

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,40}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_SCORE = 1000.0
MAX_QUESTION_SCORE = 100.0


# ---------------------------------------------------------------------------
# 通用工具
# ---------------------------------------------------------------------------


# 上海无夏令时；固定 UTC+8，避免服务器时区为 UTC 时把当天考试误判为未来。
SHANGHAI = timezone(timedelta(hours=8))


def local_today() -> date:
    return datetime.now(SHANGHAI).date()


def parse_iso_date(value, label: str, *, max_date: date | None = None, min_date: date | None = None) -> str:
    text = str(value or "").strip()
    if not DATE_RE.match(text):
        raise ValidationError(f"{label}格式应为 YYYY-MM-DD。")
    try:
        parsed = date.fromisoformat(text)
    except ValueError as exc:
        raise ValidationError(f"{label}不是有效日期。") from exc
    if min_date and parsed < min_date:
        raise ValidationError(f"{label}不能早于 {min_date.isoformat()}。")
    if max_date and parsed > max_date:
        raise ValidationError(f"{label}不能晚于今天。")
    return parsed.isoformat()


def _number(value, label: str) -> float:
    if isinstance(value, bool) or value is None or value == "":
        raise ValidationError(f"请填写{label}。")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{label}应为数字。") from exc
    if not math.isfinite(number):
        raise ValidationError(f"{label}应为有限数字。")
    return number


def _integer(value, label: str) -> int:
    number = _number(value, label)
    if not number.is_integer():
        raise ValidationError(f"{label}应为整数。")
    return int(number)


def _text(value, label: str, *, required: bool = False, max_length: int = 200) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise ValidationError(f"请填写{label}。")
    if len(text) > max_length:
        raise ValidationError(f"{label}不能超过 {max_length} 个字符。")
    return text


def normalize_question_key(text: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))


def rank_share(rank, count):
    if not isinstance(rank, int) or isinstance(rank, bool):
        return None
    if not isinstance(count, int) or isinstance(count, bool):
        return None
    if rank < 1 or count < 1 or rank > count:
        return None
    return 100.0 * rank / count


def exam_total(scores: dict, kind: str):
    """按与原型一致的规则计算总分。

    scores 只包含已录取得分的科目：{subject_id: {"score": x, "max": y}}。
    模拟中考固定 750 分制；缺科时返回已录小计且不产生可比签名。
    非模拟考试按实际录入科目的得分与满分分别求和。
    """
    mock = kind == "zhongkaoMock"
    covered = [subject for subject in SUBJECTS if subject["id"] in scores]
    if not covered and not mock:
        return None
    score = sum(scores[subject["id"]]["score"] for subject in covered) if covered else None
    partial_mock = mock and len(covered) < len(SUBJECTS)
    if mock:
        # 模拟中考整场满分固定 750；缺科时以 750 作为整场满分展示已录小计。
        max_score = float(MOCK_TOTAL_MAX)
        signature = None if partial_mock else "zhongkaoMock|" + "|".join(
            f"{subject['id']}:{scores[subject['id']]['max']}" for subject in covered
        )
    else:
        max_score = sum(scores[subject["id"]]["max"] for subject in covered) if covered else None
        signature = None if not covered else "custom|" + "|".join(
            f"{subject['id']}:{scores[subject['id']]['max']}" for subject in covered
        )
    return {
        "score": score,
        "max": max_score,
        "signature": signature,
        "partialMock": partial_mock,
        "count": len(covered),
        "included": [subject["id"] for subject in covered],
    }


# ---------------------------------------------------------------------------
# 校验
# ---------------------------------------------------------------------------


def validate_profile(payload: dict) -> dict:
    student_name = _text(payload.get("studentName"), "学生称呼", required=True, max_length=24)
    grade = _text(payload.get("grade"), "年级", max_length=8)
    if grade and grade not in GRADES:
        raise ValidationError("请选择有效年级。")
    class_name = _text(payload.get("className"), "班级", max_length=24)
    return {"student_name": student_name, "grade": grade, "class_name": class_name}


def validate_cohort(payload: dict) -> dict:
    class_count = None if payload.get("classCount") in (None, "") else _integer(payload.get("classCount"), "班级人数")
    grade_count = None if payload.get("gradeCount") in (None, "") else _integer(payload.get("gradeCount"), "年级人数")
    for label, value in (("班级人数", class_count), ("年级人数", grade_count)):
        if value is not None and not (1 <= value <= 100000):
            raise ValidationError(f"{label}应在 1–100000 之间。")
    if class_count is not None and grade_count is not None and class_count > grade_count:
        raise ValidationError("班级人数不能大于年级人数。")
    return {"class_count": class_count, "grade_count": grade_count}


def validate_target(payload: dict):
    raw = payload.get("target")
    if raw in (None, ""):
        return None
    target = _integer(raw, "阶段排名目标")
    if not (1 <= target <= 100000):
        raise ValidationError("阶段排名目标应在 1–100000 之间。")
    return target


def validate_subject_targets(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("学科目标格式不正确。")
    updated = {}
    for subject_id, raw in payload.items():
        if subject_id not in SUBJECT_BY_ID:
            raise ValidationError("包含未知学科。")
        if raw in (None, ""):
            continue
        value = _number(raw, f"{SUBJECT_BY_ID[subject_id]['name']}目标")
        if not (0 <= value <= 100):
            raise ValidationError(f"{SUBJECT_BY_ID[subject_id]['name']}目标应在 0–100% 之间。")
        updated[subject_id] = value
    return updated


def validate_score_maxima(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("满分设置格式不正确。")
    updated = {}
    for subject_id, raw in payload.items():
        if subject_id not in SUBJECT_BY_ID:
            raise ValidationError("包含未知学科。")
        if raw in (None, ""):
            updated[subject_id] = None
            continue
        value = _number(raw, f"{SUBJECT_BY_ID[subject_id]['name']}满分")
        if not (0 < value <= MAX_SCORE):
            raise ValidationError(f"{SUBJECT_BY_ID[subject_id]['name']}满分应在 0–{int(MAX_SCORE)} 之间。")
        updated[subject_id] = value
    return updated


def validate_exam(payload: dict, *, class_count, grade_count) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("考试数据格式不正确。")

    name = _text(payload.get("name"), "考试名称", required=True, max_length=45)
    exam_date = parse_iso_date(
        payload.get("date"),
        "考试日期",
        min_date=date(2000, 1, 1),
        max_date=local_today(),
    )
    kind = str(payload.get("kind") or "")
    scope = str(payload.get("scope") or "")
    if kind not in VALID_EXAM_KINDS:
        raise ValidationError("请选择考试类型。")
    if scope not in VALID_EXAM_SCOPES:
        raise ValidationError("请选择参考范围。")

    class_rank = None if payload.get("classRank") in (None, "") else _integer(payload.get("classRank"), "班级名次")
    grade_rank = None if payload.get("gradeRank") in (None, "") else _integer(payload.get("gradeRank"), "年级名次")
    for label, rank, count in (
        ("班级", class_rank, class_count),
        ("年级", grade_rank, grade_count),
    ):
        if rank is not None:
            if not (1 <= rank <= 100000):
                raise ValidationError(f"{label}名次应在 1–100000 之间。")
            if count is not None and rank > count:
                raise ValidationError(f"{label}名次不能大于参考人数。")

    note = _text(payload.get("note"), "复盘笔记", max_length=500)
    org_name = _text(payload.get("orgName"), "机构名称", max_length=40)
    scores_in = payload.get("scores") or {}
    statuses_in = payload.get("scoreStatuses") or {}
    if not isinstance(scores_in, dict) or not isinstance(statuses_in, dict):
        raise ValidationError("学科成绩格式不正确。")

    unknown = (set(scores_in) | set(statuses_in)) - set(SUBJECT_IDS)
    if unknown:
        raise ValidationError("包含未知学科。")

    scores = {}
    statuses = {}
    for subject in SUBJECTS:
        subject_id = subject["id"]
        entry = scores_in.get(subject_id)
        status = statuses_in.get(subject_id)
        if entry is not None and status:
            raise ValidationError(f"{subject['name']}不能同时录入成绩和考试状态。")
        if status:
            if status not in SCORE_STATUSES:
                raise ValidationError(f"{subject['name']}的考试状态无效。")
            statuses[subject_id] = status
            continue
        if entry is None:
            continue
        if not isinstance(entry, dict):
            raise ValidationError(f"{subject['name']}成绩格式不正确。")
        raw_score = entry.get("score")
        raw_max = entry.get("max")
        if raw_score in (None, "") and raw_max in (None, ""):
            continue
        if raw_score in (None, ""):
            raise ValidationError(f"{subject['name']}暂未录入得分，请将满分也留空。")
        if raw_max in (None, ""):
            raise ValidationError(f"请填写{subject['name']}满分。")
        score = _number(raw_score, f"{subject['name']}得分")
        max_score = _number(raw_max, f"{subject['name']}满分")
        if not (0 < max_score <= MAX_SCORE):
            raise ValidationError(f"{subject['name']}满分应在 0–{int(MAX_SCORE)} 之间。")
        if not (0 <= score <= max_score):
            raise ValidationError(f"请核对{subject['name']}得分和满分，得分不能超过满分。")
        scores[subject_id] = {"score": score, "max": max_score}

    if kind == "zhongkaoMock" and len(scores) == len(SUBJECTS):
        total_max = sum(entry["max"] for entry in scores.values())
        if abs(total_max - MOCK_TOTAL_MAX) > 1e-6:
            raise ValidationError("模拟中考各科满分合计应为 750 分；如需其他总满分，请选择普通考试类型。")

    if not scores and not statuses and class_rank is None and grade_rank is None:
        raise ValidationError("请至少录入一门学科的得分、考试状态或一项排名。")

    return {
        "name": name,
        "date": exam_date,
        "kind": kind,
        "scope": scope,
        "class_rank": class_rank,
        "grade_rank": grade_rank,
        "class_count": class_count,
        "grade_count": grade_count,
        "note": note,
        "org_name": org_name,
        "scores": scores,
        "statuses": statuses,
    }


def validate_evidence(payload: dict, *, subject_ids=SUBJECT_IDS) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("题目证据格式不正确。")
    subject_id = str(payload.get("subject") or "")
    if subject_id not in subject_ids:
        raise ValidationError("请选择有效学科。")
    question = _text(payload.get("question"), "题号", required=True, max_length=28)
    skill = _text(payload.get("skill"), "技能", required=True, max_length=35)
    topic = _text(payload.get("topic"), "知识点", max_length=35)
    question_type = _text(payload.get("questionType"), "题型", max_length=24)
    reason = _text(payload.get("reason"), "错因", max_length=250)
    score = _number(payload.get("score"), "本题得分")
    max_score = _number(payload.get("max"), "本题满分")
    if not (0 < max_score <= MAX_QUESTION_SCORE):
        raise ValidationError(f"本题满分应在 0–{int(MAX_QUESTION_SCORE)} 之间。")
    if not (0 <= score <= max_score):
        raise ValidationError("本题得分不能超过满分。")
    return {
        "subject_id": subject_id,
        "question": question,
        "question_key": normalize_question_key(question),
        "skill": skill,
        "topic": topic,
        "question_type": question_type,
        "reason": reason,
        "score": score,
        "max_score": max_score,
    }


def validate_task(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("练习安排格式不正确。")
    title = _text(payload.get("title"), "练习目标", required=True, max_length=60)
    plan = _text(payload.get("plan"), "具体计划", max_length=250)
    due = parse_iso_date(payload.get("due"), "计划完成日期", min_date=date(2000, 1, 1))
    evidence_id = str(payload.get("evidenceId") or "").strip() or None
    return {"title": title, "plan": plan, "due_date": due, "evidence_id": evidence_id}


def validate_retest(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("复测结果格式不正确。")
    correct = _integer(payload.get("correct"), "正确题数")
    total = _integer(payload.get("total"), "总题数")
    if not (0 <= correct <= 100):
        raise ValidationError("正确题数应在 0–100 之间。")
    if not (1 <= total <= 100):
        raise ValidationError("总题数应在 1–100 之间。")
    if correct > total:
        raise ValidationError("正确题数不能大于总题数。")
    question_set = str(payload.get("questionSet") or "")
    if question_set and question_set not in RETEST_TYPES:
        raise ValidationError("题目来源无效。")
    raw_date = str(payload.get("date") or "").strip()
    result_date = parse_iso_date(raw_date, "复测日期", max_date=local_today()) if raw_date else ""
    note = _text(payload.get("note"), "复测发现", max_length=250)
    hints = payload.get("hints")
    if not isinstance(hints, bool):
        raise ValidationError("完成方式无效。")
    return {
        "correct": correct,
        "total": total,
        "question_set": question_set,
        "result_date": result_date,
        "hints": hints,
        "note": note,
    }


def validate_family(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("家庭资料格式不正确。")
    name = validate_family_name(payload)
    profile = validate_profile(payload)
    return {"name": name, **profile}


def validate_family_name(payload: dict) -> str:
    if not isinstance(payload, dict):
        raise ValidationError("家庭资料格式不正确。")
    return _text(payload.get("name"), "家庭名称", required=True, max_length=40)


def validate_account_identity(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("账号资料格式不正确。")
    username = str(payload.get("username") or "").strip()
    if not USERNAME_RE.match(username):
        raise ValidationError("账号名只能使用字母、数字、点、横线或下划线，最多 40 个字符。")
    name = _text(payload.get("name"), "称呼", required=True, max_length=24)
    is_admin = payload.get("isAdmin")
    if not isinstance(is_admin, bool):
        raise ValidationError("管理员权限格式不正确。")
    family_id = str(payload.get("familyId") or "").strip()
    if not family_id:
        raise ValidationError("请选择所属家庭。")
    return {"username": username, "name": name, "is_admin": is_admin, "family_id": family_id}


def validate_password(password) -> str:
    if not isinstance(password, str) or len(password) < 8:
        raise ValidationError("密码至少 8 位。")
    if len(password) > 128:
        raise ValidationError("密码不能超过 128 个字符。")
    return password


def validate_display_name(value) -> str:
    return _text(value, "称呼", required=True, max_length=24)


def now_iso() -> str:
    return datetime.now(SHANGHAI).isoformat(timespec="seconds")
