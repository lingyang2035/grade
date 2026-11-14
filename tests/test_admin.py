from helpers import api, api_token, change_password, create_account, create_family, find_account, login, logout, setup_admin


def admin_family_id(client):
    return client.get("/api/bootstrap").get_json()["user"]["familyId"]


def test_create_family_and_accounts(client):
    setup_admin(client)
    family = create_family(client, name="第二家", student_name="小红")
    response = create_account(client, username="member1", name="小红", family_id=family)
    assert response.status_code == 200
    assert response.get_json()["tempPassword"]
    response = create_account(client, username="member2", name="小红家长", family_id=family)
    assert response.status_code == 200
    assert response.get_json()["data"]["families"]
    response = create_account(client, username="MEMBER2", name="重复账号", family_id=family)
    assert response.status_code == 400
    assert "账号名已存在" in response.get_json()["error"]


def test_new_account_requires_password_change(client, app):
    setup_admin(client)
    family = admin_family_id(client)
    response = create_account(client, username="student1", name="小张", family_id=family)
    temp = response.get_json()["tempPassword"]
    student = app.test_client()
    response = login(student, "student1", temp)
    assert response.headers["Location"].endswith("/password")
    assert student.get("/api/bootstrap").status_code == 403
    assert change_password(student, temp, "new-password-1").status_code == 302
    assert student.get("/api/bootstrap").status_code == 200


def test_reset_password_invalidates_sessions_and_old_password(client, app):
    setup_admin(client)
    family = admin_family_id(client)
    response = create_account(client, username="parent3", name="家长三", family_id=family)
    temp = response.get_json()["tempPassword"]
    parent = app.test_client()
    login(parent, "parent3", temp)
    change_password(parent, temp, "parent-pass-1")
    assert parent.get("/api/bootstrap").status_code == 200

    account = find_account(client, "parent3")
    response = client.post(
        f"/api/admin/accounts/{account['id']}/reset-password",
        headers={"X-CSRF-Token": api_token(client)},
    )
    assert response.status_code == 200
    temp2 = response.get_json()["tempPassword"]
    # 旧会话因密码版本变化而失效。
    assert parent.get("/api/bootstrap").status_code == 401
    response = login(parent, "parent3", "parent-pass-1")
    assert response.status_code == 200
    assert "账号或密码不正确" in response.get_data(as_text=True)
    response = login(parent, "parent3", temp2)
    assert response.headers["Location"].endswith("/password")


def test_cannot_disable_self_or_remove_last_admin(client):
    setup_admin(client)
    family = admin_family_id(client)
    admin = find_account(client, "admin")
    token = api_token(client)
    response = client.post(
        f"/api/admin/accounts/{admin['id']}/toggle",
        headers={"X-CSRF-Token": token},
    )
    assert response.status_code == 400
    assert "不能停用当前账号" in response.get_json()["error"]

    response = create_account(client, username="admin2", name="管理员二", family_id=family, is_admin=True)
    assert response.status_code == 200
    admin2 = find_account(client, "admin2")
    payload = {
        "username": "admin2",
        "name": "管理员二",
        "isAdmin": False,
        "familyId": family,
    }
    response = api(client, "patch", f"/api/admin/accounts/{admin2['id']}", payload)
    assert response.status_code == 200
    # 现在 admin 是唯一启用的管理员，不能把自己降级。
    payload = {
        "username": "admin",
        "name": "管理员",
        "isAdmin": False,
        "familyId": family,
    }
    response = api(client, "patch", f"/api/admin/accounts/{admin['id']}", payload)
    assert response.status_code == 400
    assert "至少保留一个启用的管理员账号" in response.get_json()["error"]


def test_admin_can_edit_and_toggle_other_accounts(client, app):
    setup_admin(client)
    family = admin_family_id(client)
    response = create_account(client, username="student1", name="小张", family_id=family)
    assert response.status_code == 200
    account = find_account(client, "student1")
    payload = {
        "username": "student1_new",
        "name": "小张同学",
        "isAdmin": False,
        "familyId": family,
    }
    response = api(client, "patch", f"/api/admin/accounts/{account['id']}", payload)
    assert response.status_code == 200
    account = find_account(client, "student1_new")
    response = client.post(
        f"/api/admin/accounts/{account['id']}/toggle",
        headers={"X-CSRF-Token": api_token(client)},
    )
    assert response.status_code == 200
    assert find_account(client, "student1_new")["active"] is False
    response = client.post(
        f"/api/admin/accounts/{account['id']}/toggle",
        headers={"X-CSRF-Token": api_token(client)},
    )
    assert response.status_code == 200
    assert find_account(client, "student1_new")["active"] is True


def test_non_admin_cannot_use_admin_api(client, app):
    setup_admin(client)
    family = admin_family_id(client)
    response = create_account(client, username="student1", name="小张", family_id=family)
    temp = response.get_json()["tempPassword"]
    student = app.test_client()
    login(student, "student1", temp)
    change_password(student, temp, "student-pass-1")
    assert student.get("/api/admin").status_code == 403
    response = student.post(
        "/api/admin/families",
        json={"name": "x", "studentName": "y"},
        headers={"X-CSRF-Token": api_token(student)},
    )
    assert response.status_code == 403


def test_admin_cannot_reset_own_password(client):
    setup_admin(client)
    admin = find_account(client, "admin")
    response = client.post(
        f"/api/admin/accounts/{admin['id']}/reset-password",
        headers={"X-CSRF-Token": api_token(client)},
    )
    assert response.status_code == 400
    assert "我的" in response.get_json()["error"]


def test_admin_can_rename_family_but_not_edit_learning_profile(client):
    setup_admin(client)
    family_id = create_family(client, name="第二家", student_name="小红")
    response = api(
        client,
        "patch",
        f"/api/admin/families/{family_id}",
        {"name": "改名后的家庭", "studentName": "被管理员修改"},
    )
    assert response.status_code == 200
    family = next(item for item in response.get_json()["data"]["families"] if item["id"] == family_id)
    assert family["name"] == "改名后的家庭"
    assert family["studentName"] == "小红"
