from datetime import timedelta

from app.domain import local_today

from helpers import api, api_token, change_password, create_account, login, setup_admin


def ymd(days=0):
    return (local_today() + timedelta(days=days)).isoformat()


def make_exam(client, name="复盘考试"):
    payload = {
        "name": name,
        "date": ymd(-1),
        "kind": "unit",
        "scope": "school",
        "classRank": None,
        "gradeRank": None,
        "scores": {"math": {"score": 100, "max": 150}},
        "scoreStatuses": {"physics": "pending"},
        "note": "",
    }
    response = api(client, "post", "/api/exams", payload)
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]["exams"][0]


def test_evidence_create_duplicate_and_update(client):
    setup_admin(client)
    exam = make_exam(client)
    payload = {
        "examId": exam["id"],
        "subject": "math",
        "question": "第 23 题",
        "score": 5,
        "max": 10,
        "topic": "一次函数",
        "skill": "建模",
        "questionType": "解答题",
        "reason": "漏写变量关系",
    }
    response = api(client, "post", "/api/evidence", payload)
    assert response.status_code == 200
    evidence_id = response.get_json()["evidenceId"]
    duplicate = dict(payload, question="第23题")
    response = api(client, "post", "/api/evidence", duplicate)
    assert response.status_code == 400
    assert "已经记录过这道题" in response.get_json()["error"]

    updated = dict(payload, question="第 24 题", score=8, reason="订正后")
    response = api(client, "put", f"/api/evidence/{evidence_id}", updated)
    assert response.status_code == 200
    evidence = response.get_json()["data"]["evidence"][0]
    assert evidence["question"] == "第 24 题"
    assert evidence["score"] == 8

    # 同一考试的另一道题可以继续录入；题目可以属于没有卷面成绩的学科。
    payload2 = dict(payload, subject="physics", question="第 14 题", score=3, max=5, skill="图表信息提取")
    assert api(client, "post", "/api/evidence", payload2).status_code == 200


def test_evidence_validation(client):
    setup_admin(client)
    exam = make_exam(client)
    base = {
        "examId": exam["id"],
        "subject": "math",
        "question": "第 1 题",
        "score": 3,
        "max": 4,
        "skill": "计算",
    }
    assert api(client, "post", "/api/evidence", dict(base, score=5)).status_code == 400
    assert api(client, "post", "/api/evidence", dict(base, max=101)).status_code == 400
    assert api(client, "post", "/api/evidence", dict(base, skill="")).status_code == 400
    assert api(client, "post", "/api/evidence", dict(base, subject="unknown")).status_code == 400
    assert api(client, "post", "/api/evidence", dict(base, examId="missing")).status_code == 404


def test_evidence_belongs_to_family(client, app):
    setup_admin(client)
    exam = make_exam(client)
    api(
        client,
        "post",
        "/api/evidence",
        {"examId": exam["id"], "subject": "math", "question": "第 1 题", "score": 3, "max": 4, "skill": "计算"},
    )
    assert len(client.get("/api/bootstrap").get_json()["data"]["evidence"]) == 1


def test_student_can_record_evidence_and_tasks(client, app):
    setup_admin(client)
    exam = make_exam(client)
    response = create_account(
        client,
        username="student1",
        name="小张",
        family_id=client.get("/api/bootstrap").get_json()["user"]["familyId"],
    )
    temp = response.get_json()["tempPassword"]
    student = app.test_client()
    login(student, "student1", temp)
    change_password(student, temp, "student-pass-1")
    response = api(
        student,
        "post",
        "/api/evidence",
        {"examId": exam["id"], "subject": "math", "question": "第 5 题", "score": 2, "max": 4, "skill": "计算"},
    )
    assert response.status_code == 200
    response = api(
        student,
        "post",
        "/api/tasks",
        {"evidenceId": response.get_json()["evidenceId"], "title": "重做同类题", "plan": "独立完成", "due": ymd(3)},
    )
    assert response.status_code == 200
    # 学生也可以录入并补录自己的考试，家长看到同一条记录。
    response = api(
        student,
        "post",
        "/api/exams",
        {
            "name": "学生自录",
            "date": ymd(-1),
            "kind": "weekly",
            "scope": "class",
            "classRank": 5,
            "scores": {"math": {"score": 82, "max": 100}, "english": {"score": 90, "max": 100}},
            "scoreStatuses": {},
        },
    )
    assert response.status_code == 200, response.get_json()
    exam_id = response.get_json()["examId"]
    exam = next(item for item in response.get_json()["data"]["exams"] if item["id"] == exam_id)
    assert exam["total"]["score"] == 172 and exam["total"]["max"] == 200
    # 补录一科，保留已有分数。
    response = api(
        student,
        "put",
        f"/api/exams/{exam_id}",
        {
            "name": "学生自录",
            "date": ymd(-1),
            "kind": "weekly",
            "scope": "class",
            "classRank": 5,
            "scores": {
                "math": {"score": 82, "max": 100},
                "english": {"score": 90, "max": 100},
                "physics": {"score": 76, "max": 100},
            },
            "scoreStatuses": {},
        },
    )
    assert response.status_code == 200
    updated = next(item for item in response.get_json()["data"]["exams"] if item["id"] == exam_id)
    assert updated["total"]["score"] == 248 and updated["total"]["count"] == 3
    parent_view = client.get("/api/bootstrap").get_json()["data"]["exams"]
    assert next(item for item in parent_view if item["id"] == exam_id)["total"]["score"] == 248


def test_tasks_and_retest_rules(client):
    setup_admin(client)
    exam = make_exam(client)
    response = api(
        client,
        "post",
        "/api/tasks",
        {"title": "独立做 3 道新题", "plan": "先写变量关系", "due": ymd(2)},
    )
    assert response.status_code == 200
    task_id = response.get_json()["taskId"]
    assert api(
        client,
        "post",
        "/api/tasks",
        {"evidenceId": "missing", "title": "无效来源", "due": ymd(2)},
    ).status_code == 404

    valid = {"correct": 2, "total": 3, "questionSet": "new", "date": ymd(-1), "hints": False, "note": "还需检查单位"}
    assert api(client, "put", f"/api/tasks/{task_id}/result", valid).status_code == 200
    boot = client.get("/api/bootstrap").get_json()["data"]
    task = boot["tasks"][0]
    assert task["result"]["correct"] == 2
    assert task["result"]["questionSet"] == "new"
    assert task["result"]["hints"] is False

    assert api(client, "put", f"/api/tasks/{task_id}/result", dict(valid, correct=4)).status_code == 400
    assert api(client, "put", f"/api/tasks/{task_id}/result", dict(valid, date=ymd(1))).status_code == 400
    assert api(client, "put", f"/api/tasks/{task_id}/result", dict(valid, questionSet="bad")).status_code == 400
    assert api(client, "put", f"/api/tasks/{task_id}/result", dict(valid, hints="yes")).status_code == 400
    assert api(client, "put", "/api/tasks/missing/result", valid).status_code == 404


def test_task_origin_is_family_scoped(client, app):
    setup_admin(client)
    exam = make_exam(client)
    response = api(
        client,
        "post",
        "/api/evidence",
        {"examId": exam["id"], "subject": "math", "question": "第 2 题", "score": 2, "max": 4, "skill": "计算"},
    )
    evidence_id = response.get_json()["evidenceId"]
    response = api(
        client,
        "post",
        "/api/tasks",
        {"evidenceId": evidence_id, "title": "重做", "due": ymd(2)},
    )
    assert response.status_code == 200
    task_id = response.get_json()["taskId"]
    assert api(client, "put", f"/api/tasks/{task_id}/result", {"correct": 1, "total": 2, "hints": False}).status_code == 200
