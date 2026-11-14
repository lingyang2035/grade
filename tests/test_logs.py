from datetime import timedelta

from app.domain import local_today

from helpers import api, api_token, change_password, create_account, create_family, login, setup_admin


def ymd(days=0):
    return (local_today() + timedelta(days=days)).isoformat()


def exam_payload(name="日志测试"):
    return {
        "name": name,
        "date": ymd(-1),
        "kind": "weekly",
        "scope": "class",
        "classRank": None,
        "gradeRank": None,
        "scores": {"math": {"score": 90, "max": 100}},
        "scoreStatuses": {},
        "note": "",
    }


def make_member(app, client, username="member1", family_id=None):
    family_id = family_id or client.get("/api/bootstrap").get_json()["user"]["familyId"]
    response = create_account(client, username=username, name=username, family_id=family_id)
    assert response.status_code == 200, response.get_json()
    temp = response.get_json()["tempPassword"]
    member = app.test_client()
    login(member, username, temp)
    change_password(member, temp, "member-pass-1")
    return member


def test_exam_create_update_delete_are_logged(client):
    setup_admin(client)
    response = api(client, "post", "/api/exams", exam_payload())
    assert response.status_code == 200
    exam_id = response.get_json()["examId"]
    payload = exam_payload("改名后")
    assert api(client, "put", f"/api/exams/{exam_id}", payload).status_code == 200
    logs = client.get("/api/logs").get_json()["logs"]
    assert [item["action"] for item in logs[:2]] == ["exam.update", "exam.create"]
    assert all(item["actorName"] == "管理员" for item in logs[:2])
    assert "改名后" in logs[0]["summary"]

    response = api(client, "delete", f"/api/exams/{exam_id}")
    assert response.status_code == 200, response.get_json()
    assert client.get("/api/bootstrap").get_json()["data"]["exams"] == []
    logs = client.get("/api/logs").get_json()["logs"]
    assert logs[0]["action"] == "exam.delete"
    assert "日志测试" not in logs[0]["summary"] and "改名后" in logs[0]["summary"]


def test_only_admin_can_delete_exam(client, app):
    setup_admin(client)
    response = api(client, "post", "/api/exams", exam_payload())
    exam_id = response.get_json()["examId"]
    member = make_member(app, client)
    response = api(member, "delete", f"/api/exams/{exam_id}")
    assert response.status_code == 403
    assert client.get("/api/bootstrap").get_json()["data"]["exams"]


def test_delete_removes_evidence_but_keeps_linked_task(client, app):
    setup_admin(client)
    response = api(client, "post", "/api/exams", exam_payload())
    exam_id = response.get_json()["examId"]
    response = api(
        client,
        "post",
        "/api/evidence",
        {"examId": exam_id, "subject": "math", "question": "第 1 题", "score": 3, "max": 4, "skill": "计算"},
    )
    evidence_id = response.get_json()["evidenceId"]
    response = api(client, "post", "/api/tasks", {"evidenceId": evidence_id, "title": "重做", "plan": "", "due": ymd(3)})
    assert response.status_code == 200
    assert api(client, "delete", f"/api/exams/{exam_id}").status_code == 200
    data = client.get("/api/bootstrap").get_json()["data"]
    assert data["exams"] == []
    assert data["evidence"] == []
    assert data["tasks"][0]["evidenceId"] is None
    assert len(data["tasks"]) == 1


def test_logs_are_family_scoped_but_admin_sees_all(client, app):
    setup_admin(client)
    api(client, "post", "/api/exams", exam_payload("A 家考试"))
    family_b = create_family(client, name="第二家", student_name="小红")
    member_b = make_member(app, client, username="member_b", family_id=family_b)
    api(member_b, "post", "/api/exams", exam_payload("B 家考试"))

    own = member_b.get("/api/logs").get_json()["logs"]
    assert [item["summary"] for item in own] == ["创建考试「B 家考试」"]
    assert own[0]["familyName"] == "第二家"

    everything = client.get("/api/logs").get_json()["logs"]
    summaries = [item["summary"] for item in everything]
    assert "创建考试「A 家考试」" in summaries
    assert "创建考试「B 家考试」" in summaries
    assert {item["familyName"] for item in everything} == {"测试家庭", "第二家"}


def test_logs_require_login(app):
    anonymous = app.test_client()
    assert anonymous.get("/api/logs").status_code == 401
