"""Grade Flask 应用工厂。"""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import timedelta
from pathlib import Path

from flask import Flask, g, jsonify, request
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from . import admin_api, api, auth, db, pages
from .domain import APP_VERSION, ValidationError
from .errors import ApiError, CsrfError

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _secret_key(data_dir: Path) -> str:
    env_key = os.environ.get("GRADE_SECRET_KEY")
    if env_key:
        return env_key
    key_file = Path(os.environ.get("GRADE_SECRET_KEY_FILE") or (data_dir / "secret_key"))
    if key_file.exists():
        return key_file.read_text(encoding="utf-8").strip()
    key_file.parent.mkdir(parents=True, exist_ok=True)
    key = secrets.token_hex(32)
    key_file.write_text(key, encoding="utf-8")
    try:
        key_file.chmod(0o600)
    except OSError:
        pass
    return key


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    data_dir = Path(os.environ.get("GRADE_DATA_DIR") or (PROJECT_ROOT / "data"))
    app.config.from_mapping(
        DATA_DIR=str(data_dir),
        DATABASE=os.environ.get("GRADE_DATABASE") or str(data_dir / "grade.db"),
        SECRET_KEY=None,
        SESSION_COOKIE_NAME="grade_session",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("GRADE_COOKIE_SECURE", "").lower() in {"1", "true", "yes"},
        SESSION_COOKIE_PATH=os.environ.get("GRADE_COOKIE_PATH", "/"),
        PERMANENT_SESSION_LIFETIME=timedelta(days=30),
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        SEND_FILE_MAX_AGE_DEFAULT=0,
    )
    if test_config:
        app.config.update(test_config)
        if "DATA_DIR" in test_config and "DATABASE" not in test_config:
            app.config["DATABASE"] = str(Path(app.config["DATA_DIR"]) / "grade.db")
    if not app.config.get("SECRET_KEY"):
        app.config["SECRET_KEY"] = _secret_key(Path(app.config["DATA_DIR"]))
    data_dir_path = Path(app.config["DATA_DIR"])
    data_dir_path.mkdir(parents=True, exist_ok=True)
    try:
        data_dir_path.chmod(0o700)
    except OSError:
        pass
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    app.json.ensure_ascii = False
    app.json.sort_keys = False
    app.jinja_env.globals["app_version"] = APP_VERSION

    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    db.init_app(app)
    auth.init_app(app)

    @app.before_request
    def protect_api_csrf():
        if (
            request.path.startswith("/api/")
            and request.method in {"POST", "PUT", "PATCH", "DELETE"}
            and g.user is not None
        ):
            auth.check_csrf()

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; font-src 'self'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        )
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(ApiError)
    def handle_api_error(error: ApiError):
        return jsonify(error=error.message, code=error.code), error.status

    @app.errorhandler(CsrfError)
    def handle_csrf_error(_error):
        if request.path.startswith("/api/"):
            return jsonify(error="页面已过期，请刷新后重试。", code="csrf_failed"), 400
        return "页面已过期，请刷新后重试。", 400

    @app.errorhandler(ValidationError)
    def handle_validation_error(error: ValidationError):
        if request.path.startswith("/api/"):
            return jsonify(error=error.message), error.status
        return error.message, error.status

    @app.errorhandler(HTTPException)
    def handle_http_error(error: HTTPException):
        if request.path.startswith("/api/"):
            return jsonify(error=error.description or "请求失败。"), error.code
        return error

    @app.errorhandler(sqlite3.IntegrityError)
    def handle_integrity_error(_error):
        if request.path.startswith("/api/"):
            return jsonify(error="数据与已有记录冲突，请刷新后重试。"), 409
        return "数据与已有记录冲突，请刷新后重试。", 409

    app.register_blueprint(auth.bp)
    app.register_blueprint(pages.bp)
    app.register_blueprint(api.bp)
    app.register_blueprint(admin_api.bp)

    return app
