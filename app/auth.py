"""登录、首次初始化、改密与权限装饰器。"""

from __future__ import annotations

import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from functools import wraps
from urllib.parse import urlparse

from flask import (
    Blueprint,
    current_app,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db
from .domain import GRADES, USERNAME_RE, ValidationError, now_iso, validate_family, validate_password
from .errors import ApiError, CsrfError

bp = Blueprint("auth", __name__)

FAILURE_WINDOW_SECONDS = 600
FAILURE_LIMIT = 5
_failures: dict[str, deque[float]] = defaultdict(deque)
_failure_lock = threading.Lock()


def user_count(db=None) -> int:
    db = db or get_db()
    return int(db.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"])


def load_user():
    """在每个请求前根据会话加载用户，并校验启用状态与密码版本。"""
    g.user = None
    user_id = session.get("user_id")
    if not user_id:
        return
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None or not row["active"] or session.get("session_version") != row["session_version"]:
        session.clear()
        return
    g.user = row


def _password_change_allowed() -> bool:
    return request.endpoint in {"auth.password", "auth.logout", "static"}


def enforce_password_change():
    if g.user is None or not g.user["must_change_password"]:
        return
    if _password_change_allowed():
        return
    if request.path.startswith("/api/"):
        return jsonify(error="请先修改密码。", code="password_change_required"), 403
    return redirect(url_for("auth.password"))


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            if request.path.startswith("/api/"):
                return jsonify(error="登录已失效，请重新登录。", code="login_required"), 401
            return redirect(url_for("auth.login"))
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if not g.user["is_admin"]:
            raise ApiError("账号管理仅限管理员操作。", 403, "admin_required")
        return view(*args, **kwargs)

    return wrapped


def csrf_token() -> str:
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def rotate_csrf_token() -> str:
    session.pop("csrf_token", None)
    return csrf_token()


def check_csrf(*, from_form: bool = False) -> None:
    expected = session.get("csrf_token")
    provided = request.form.get("csrf_token") if from_form else request.headers.get("X-CSRF-Token")
    if not expected or not provided or not secrets.compare_digest(str(expected), str(provided)):
        raise CsrfError()


def _rate_limit_key() -> str:
    username = str(request.form.get("username") or "").strip().lower()
    return f"{request.remote_addr or '-'}:{username}"


def _check_rate_limit(key: str) -> bool:
    now = time.monotonic()
    with _failure_lock:
        attempts = _failures[key]
        while attempts and attempts[0] < now - FAILURE_WINDOW_SECONDS:
            attempts.popleft()
        return len(attempts) >= FAILURE_LIMIT


def _record_failure(key: str) -> None:
    with _failure_lock:
        _failures[key].append(time.monotonic())


def _clear_failures(key: str) -> None:
    with _failure_lock:
        _failures.pop(key, None)


def _safe_next(value) -> str:
    """登录后只允许跳回站内路径。"""
    if not value:
        return url_for("pages.index")
    parsed = urlparse(str(value))
    if parsed.scheme or parsed.netloc or not parsed.path.startswith("/"):
        return url_for("pages.index")
    return parsed.path


def _login_session(row) -> None:
    session.clear()
    session.permanent = True
    session["user_id"] = row["id"]
    session["session_version"] = row["session_version"]
    rotate_csrf_token()


@bp.route("/setup", methods=["GET", "POST"])
def setup():
    if user_count() > 0:
        return redirect(url_for("auth.login"))
    error = ""
    form = {
        "familyName": "",
        "studentName": "",
        "grade": "",
        "className": "",
        "username": "",
        "displayName": "",
    }
    if request.method == "POST":
        for key in list(form):
            form[key] = str(request.form.get(key) or "").strip()
        try:
            check_csrf(from_form=True)
            family = validate_family(
                {
                    "name": form["familyName"],
                    "studentName": form["studentName"],
                    "grade": form["grade"],
                    "className": form["className"],
                }
            )
            username = form["username"]
            if not USERNAME_RE.match(username):
                raise ValidationError("账号名只能使用字母、数字、点、横线或下划线，最多 40 个字符。")
            display_name = form["displayName"]
            if not display_name:
                raise ValidationError("请填写管理员称呼。")
            if len(display_name) > 24:
                raise ValidationError("称呼不能超过 24 个字符。")
            password = validate_password(request.form.get("password"))
            if password != request.form.get("confirmPassword"):
                raise ValidationError("两次输入的密码不一致。")

            db = get_db()
            now = now_iso()
            family_id = secrets.token_hex(16)
            user_id = secrets.token_hex(16)
            try:
                with db:
                    db.execute(
                        "INSERT INTO families(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                        (family_id, family["name"], now, now),
                    )
                    db.execute(
                        "INSERT INTO family_profiles(family_id, student_name, grade, class_name, updated_at) VALUES (?, ?, ?, ?, ?)",
                        (family_id, family["student_name"], family["grade"], family["class_name"], now),
                    )
                    db.execute(
                        "INSERT INTO family_settings(family_id, class_count, grade_count, grade_target, updated_at) VALUES (?, NULL, NULL, NULL, ?)",
                        (family_id, now),
                    )
                    db.execute(
                        """
                        INSERT INTO users(id, family_id, username, display_name, is_admin, active,
                                          password_hash, must_change_password, session_version, created_at, updated_at)
                        VALUES (?, ?, ?, ?, 1, 1, ?, 0, 0, ?, ?)
                        """,
                        (
                            user_id,
                            family_id,
                            username,
                            display_name,
                            generate_password_hash(password),
                            now,
                            now,
                        ),
                    )
            except sqlite3.IntegrityError as exc:
                raise ValidationError("账号名已存在。") from exc
            row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            _login_session(row)
            flash("初始化完成。已创建管理员账号和第一个家庭。")
            return redirect(url_for("pages.index"))
        except CsrfError:
            error = "页面已过期，请刷新后重试。"
        except ValidationError as exc:
            error = exc.message
    return render_template("setup.html", error=error, form=form, csrf_token=csrf_token(), grades=GRADES)


@bp.route("/login", methods=["GET", "POST"])
def login():
    if user_count() == 0:
        return redirect(url_for("auth.setup"))
    if g.user is not None and request.method == "GET":
        return redirect(url_for("pages.index"))
    error = ""
    username = ""
    if request.method == "POST":
        username = str(request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        key = _rate_limit_key()
        try:
            check_csrf(from_form=True)
            if not current_app.config.get("TESTING") and _check_rate_limit(key):
                raise ValidationError("尝试次数过多，请 10 分钟后再试。")
            row = get_db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if row is None or not row["active"] or not check_password_hash(row["password_hash"], password):
                _record_failure(key)
                raise ValidationError("账号或密码不正确。")
            _clear_failures(key)
            _login_session(row)
            if row["must_change_password"]:
                return redirect(url_for("auth.password"))
            return redirect(_safe_next(request.args.get("next")))
        except CsrfError:
            error = "页面已过期，请刷新后重试。"
        except ValidationError as exc:
            error = exc.message
    return render_template("login.html", error=error, username=username, csrf_token=csrf_token())


@bp.post("/logout")
def logout():
    try:
        check_csrf(from_form=True)
    except CsrfError:
        # 退出登录本身不改变业务数据；即使页面 token 过期也允许退出。
        pass
    session.clear()
    return redirect(url_for("auth.login"))


@bp.route("/password", methods=["GET", "POST"])
@login_required
def password():
    error = ""
    if request.method == "POST":
        try:
            check_csrf(from_form=True)
            current = request.form.get("currentPassword") or ""
            new_password = validate_password(request.form.get("newPassword"))
            if new_password != request.form.get("confirmPassword"):
                raise ValidationError("两次输入的新密码不一致。")
            if not check_password_hash(g.user["password_hash"], current):
                raise ValidationError("当前密码不正确。")
            if check_password_hash(g.user["password_hash"], new_password):
                raise ValidationError("新密码不能与当前密码相同。")
            db = get_db()
            with db:
                db.execute(
                    """
                    UPDATE users
                    SET password_hash = ?, must_change_password = 0,
                        session_version = session_version + 1, updated_at = ?
                    WHERE id = ?
                    """,
                    (generate_password_hash(new_password), now_iso(), g.user["id"]),
                )
                row = db.execute(
                    "SELECT session_version FROM users WHERE id = ?", (g.user["id"],)
                ).fetchone()
            session["session_version"] = row["session_version"]
            rotate_csrf_token()
            flash("密码已修改。")
            return redirect(url_for("pages.index"))
        except CsrfError:
            error = "页面已过期，请刷新后重试。"
        except ValidationError as exc:
            error = exc.message
    return render_template(
        "password.html",
        error=error,
        required=bool(g.user["must_change_password"]),
        csrf_token=csrf_token(),
    )


def init_app(app):
    app.before_request(load_user)
    app.before_request(enforce_password_change)
