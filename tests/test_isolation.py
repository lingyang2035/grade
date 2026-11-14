from datetime import timedelta

from app.domain import local_today

from helpers import api, change_password, create_account, create_family, login, setup_admin


def ymd(days=0):
    return (local_today() + timedelta(days=days)).isoformat()


def make_exam(client, name):
    payload = {
        "name": name,
        "date": ymd(-1),
        "kind": "unit",
        "scope": "school",
        "classRank": None,
        "gradeRank": None,
        "scores": {"math": {"score": 100, "max": 150}},
        "scoreStatuses": {},
        "note": "",
    }
    response = api(client, "post", "/api/exams", payload)
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]["exams"][0]


def family_b_client(client, app, username="parent_b", family_name="第二家", student_name="小红"):
    family_id = create_family(client, name=family_name, student_name=student_name)
    response = create_account(
        client,
        username=username,
        name="第二家家长",
        family_id=family_id,
    )
    assert response.status_code == 200, response.get_json()
    temp = response.get_json()["tempPassword"]
    other = app.test_client()
    login(other, username, temp)
    change_password(other, temp, "other-pass-1")
    return other, family_id


def test_family_exams_and_evidence_are_isolated(client, app):
    setup_admin(client)
    parent_b, _ = family_b_client(client, app)
    exam_a = make_exam(client, "A 家庭考试")
    exam_b = make_exam(parent_b, "B 家庭考试")
    boot_a = client.get("/api/bootstrap").get_json()["data"]
    boot_b = parent_b.get("/api/bootstrap").get_json()["data"]
    assert [exam["name"] for exam in boot_a["exams"]] == ["A 家庭考试"]
    assert [exam["name"] for exam in boot_b["exams"]] == ["B 家庭考试"]

    response = api(
        client,
        "post",
        "/api/evidence",
        {"examId": exam_a["id"], "subject": "math", "question": "第 1 题", "score": 3, "max": 4, "skill": "计算"},
    )
    assert response.status_code == 200
    evidence_id = response.get_json()["evidenceId"]
    assert parent_b.get("/api/bootstrap").get_json()["data"]["evidence"] == []
    # 另一家庭不能写 A 的考试或证据。
    assert api(parent_b, "put", f"/api/exams/{exam_a['id']}", {"name": "x"}).status_code == 404
    assert api(
        parent_b,
        "post",
        "/api/evidence",
        {"examId": exam_a["id"], "subject": "math", "question": "第 2 题", "score": 1, "max": 2, "skill": "计算"},
    ).status_code == 404
    assert api(
        parent_b,
        "put",
        f"/api/evidence/{evidence_id}",
        {"subject": "math", "question": "第 9 题", "score": 1, "max": 2, "skill": "计算"},
    ).status_code == 404


def test_admin_sees_accounts_but_not_other_family_scores(client, app):
    setup_admin(client)
    parent_b, family_b_id = family_b_client(client, app)
    exam_b = make_exam(parent_b, "B 家庭考试")
    boot = client.get("/api/bootstrap").get_json()
    assert boot["data"]["exams"] == []
    family_names = {family["name"] for family in boot["admin"]["families"]}
    assert family_names == {"测试家庭", "第二家"}
    accounts = {account["username"] for account in boot["admin"]["accounts"]}
    assert accounts == {"admin", "parent_b"}
    for family in boot["admin"]["families"]:
        assert "exams" not in family
        assert "scores" not in family
    assert family_b_id
    assert parent_b.get("/api/bootstrap").get_json()["data"]["exams"][0]["name"] == "B 家庭考试"
