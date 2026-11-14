from helpers import login, logout, setup_admin
from app.db import get_db


def test_security_headers_and_cookies(client):
    response = client.get("/setup")
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "same-origin"
    assert "default-src 'self'" in response.headers["Content-Security-Policy"]
    setup_admin(client)
    response = client.get("/")
    assert response.status_code == 200
    cookies = " ".join(response.headers.getlist("Set-Cookie"))
    assert "grade_session=" in cookies
    assert "HttpOnly" in cookies
    assert "SameSite=Lax" in cookies


def test_password_is_hashed(client, app):
    setup_admin(client, password="password123")
    with app.app_context():
        row = get_db().execute("SELECT password_hash FROM users WHERE username = 'admin'").fetchone()
    assert row["password_hash"] != "password123"
    assert row["password_hash"].startswith("scrypt:")


def test_unknown_api_returns_json_404(client):
    setup_admin(client)
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert "error" in response.get_json()


def test_login_is_parameterized(client):
    setup_admin(client)
    logout(client)
    response = login(client, "admin' OR 1=1 --", "anything")
    assert response.status_code == 200
    assert "账号或密码不正确" in response.get_data(as_text=True)
    assert client.get("/api/bootstrap").status_code == 401


def test_api_cache_is_no_store(client):
    setup_admin(client)
    response = client.get("/api/bootstrap")
    assert response.headers["Cache-Control"] == "no-store"


def test_subpath_prefix_is_used_for_urls_and_assets(client):
    setup_admin(client)
    headers = {"X-Forwarded-Prefix": "/grade"}
    response = client.get("/", headers=headers)
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert '<meta name="app-base" content="/grade/">' in html
    assert '/grade/static/css/app.css' in html
    boot = client.get("/api/bootstrap", headers=headers).get_json()
    assert boot["urls"]["logout"] == "/grade/logout"
    assert boot["urls"]["password"] == "/grade/password"
