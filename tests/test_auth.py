import re

from helpers import api_token, change_password, create_account, find_account, login, logout, setup_admin


def test_first_run_redirects_to_setup(client):
    assert client.get("/").headers["Location"].endswith("/setup")
    assert client.get("/login").headers["Location"].endswith("/setup")


def test_setup_creates_admin_family_and_blocks_second_setup(client):
    boot = setup_admin(client)
    assert boot["user"]["isAdmin"] is True
    assert boot["data"]["family"]["name"] == "测试家庭"
    assert boot["data"]["profile"]["studentName"] == "小明"
    assert boot["data"]["exams"] == []
    assert boot["admin"]["families"][0]["accountCount"] == 1
    response = client.get("/setup")
    assert response.status_code == 302
    assert response.headers["Location"].endswith("/login")


def test_setup_rejects_short_password(client):
    token = re.search(r'name="csrf_token" value="([^"]+)"', client.get("/setup").get_data(as_text=True)).group(1)
    response = client.post(
        "/setup",
        data={
            "csrf_token": token,
            "familyName": "测试家庭",
            "studentName": "小明",
            "grade": "初二",
            "className": "",
            "username": "admin",
            "displayName": "管理员",
            "password": "short",
            "confirmPassword": "short",
        },
    )
    assert response.status_code == 200
    assert "密码至少 8 位" in response.get_data(as_text=True)
    assert client.get("/api/bootstrap").status_code == 401


def test_login_wrong_password_and_logout(client):
    setup_admin(client)
    logout(client)
    response = login(client, "admin", "wrong-password")
    assert response.status_code == 200
    assert "账号或密码不正确" in response.get_data(as_text=True)
    response = login(client, "admin", "password123")
    assert response.status_code == 302
    assert response.headers["Location"].endswith("/")
    logout(client)
    assert client.get("/api/bootstrap").status_code == 401


def test_password_reset_forces_change_and_new_password_works(client, app):
    setup_admin(client)
    response = create_account(
        client,
        username="student1",
        name="小张",
        family_id=client.get("/api/bootstrap").get_json()["user"]["familyId"],
    )
    temp = response.get_json()["tempPassword"]
    student = app.test_client()
    response = login(student, "student1", temp)
    assert response.status_code == 302
    assert response.headers["Location"].endswith("/password")
    assert student.get("/api/bootstrap").status_code == 403
    response = change_password(student, temp, "student-pass-1")
    assert response.status_code == 302
    assert student.get("/api/bootstrap").status_code == 200
    logout(student)
    assert login(student, "student1", "student-pass-1").status_code == 302
    logout(student)
    response = login(student, "student1", temp)
    assert response.status_code == 200
    assert "账号或密码不正确" in response.get_data(as_text=True)


def test_disabled_account_cannot_login(client, app):
    setup_admin(client)
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
    logout(student)
    account = find_account(client, "student1")
    response = client.post(
        f"/api/admin/accounts/{account['id']}/toggle",
        headers={"X-CSRF-Token": api_token(client)},
    )
    assert response.status_code == 200
    response = login(student, "student1", "student-pass-1")
    assert response.status_code == 200
    assert "账号或密码不正确" in response.get_data(as_text=True)


def test_csrf_required_on_api_writes(client):
    setup_admin(client)
    response = client.post("/api/exams", json={})
    assert response.status_code == 400
    assert response.get_json()["code"] == "csrf_failed"
    response = client.post("/api/exams", json={}, headers={"X-CSRF-Token": "wrong"})
    assert response.status_code == 400


def test_api_requires_login(app):
    anonymous = app.test_client()
    assert anonymous.get("/api/bootstrap").status_code == 401
    assert anonymous.post("/api/exams", json={}).status_code == 401


def test_member_can_write_exams_and_settings(client, app):
    setup_admin(client)
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
    token = api_token(student)
    headers = {"X-CSRF-Token": token}
    exam = {
        "name": "学生自录",
        "date": "2026-01-05",
        "kind": "weekly",
        "scope": "class",
        "classRank": 5,
        "gradeRank": None,
        "scores": {"math": {"score": 82, "max": 100}, "english": {"score": 90, "max": 100}},
        "scoreStatuses": {},
        "note": "",
    }
    response = student.post("/api/exams", json=exam, headers=headers)
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["data"]["exams"][0]["name"] == "学生自录"
    # 角色概念已移除：普通成员也可以维护学习设置；中考计分接口已移除。
    assert student.put("/api/settings/profile", json={"studentName": "小张"}, headers=headers).status_code == 200
    assert student.put("/api/settings/target", json={"target": 100}, headers=headers).status_code == 200
    assert student.put("/api/settings/score-maxima/regular", json={"math": 100}, headers=headers).status_code == 200
    assert student.put("/api/ledger", json={}, headers=headers).status_code == 404
