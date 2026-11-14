"""测试用客户端与表单/CSRF 辅助函数。"""

from __future__ import annotations

import re

CSRF_RE = re.compile(r'name="csrf_token" value="([^"]+)"')


def extract_csrf(html: str) -> str:
    match = CSRF_RE.search(html)
    assert match, "页面中缺少 CSRF token"
    return match.group(1)


def setup_admin(
    client,
    *,
    username: str = "admin",
    password: str = "password123",
    family_name: str = "测试家庭",
    student_name: str = "小明",
) -> dict:
    token = extract_csrf(client.get("/setup").get_data(as_text=True))
    response = client.post(
        "/setup",
        data={
            "csrf_token": token,
            "familyName": family_name,
            "studentName": student_name,
            "grade": "初二",
            "className": "2 班",
            "username": username,
            "displayName": "管理员",
            "password": password,
            "confirmPassword": password,
        },
    )
    assert response.status_code == 302, response.get_data(as_text=True)
    return client.get("/api/bootstrap").get_json()


def login(client, username: str, password: str):
    token = extract_csrf(client.get("/login").get_data(as_text=True))
    return client.post(
        "/login",
        data={"csrf_token": token, "username": username, "password": password},
    )


def change_password(client, current: str, new: str):
    token = extract_csrf(client.get("/password").get_data(as_text=True))
    return client.post(
        "/password",
        data={
            "csrf_token": token,
            "currentPassword": current,
            "newPassword": new,
            "confirmPassword": new,
        },
    )


def logout(client) -> None:
    boot = client.get("/api/bootstrap")
    token = boot.get_json()["csrfToken"] if boot.status_code == 200 else ""
    client.post("/logout", data={"csrf_token": token})


def api_token(client) -> str:
    return client.get("/api/bootstrap").get_json()["csrfToken"]


def api(client, method: str, path: str, payload=None, token: str | None = None):
    headers = {}
    if method.lower() != "get":
        headers["X-CSRF-Token"] = token or api_token(client)
    return getattr(client, method.lower())(path, json=payload, headers=headers)


def create_account(
    client,
    *,
    username: str,
    name: str,
    family_id: str,
    is_admin: bool = False,
    token: str | None = None,
):
    return api(
        client,
        "post",
        "/api/admin/accounts",
        {
            "username": username,
            "name": name,
            "isAdmin": is_admin,
            "familyId": family_id,
        },
        token,
    )


def create_family(client, *, name: str, student_name: str, token: str | None = None) -> str:
    response = api(
        client,
        "post",
        "/api/admin/families",
        {"name": name, "studentName": student_name, "grade": "初二", "className": "1 班"},
        token,
    )
    assert response.status_code == 200, response.get_json()
    families = response.get_json()["data"]["families"]
    return next(family["id"] for family in families if family["name"] == name)


def find_account(client, username: str, token: str | None = None) -> dict:
    response = api(client, "get", "/api/admin")
    accounts = response.get_json()["data"]["accounts"]
    return next(account for account in accounts if account["username"] == username)
