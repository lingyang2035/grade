"""页面路由。登录后提供单页应用外壳，其余页面均由服务端渲染。"""

from __future__ import annotations

from flask import Blueprint, g, redirect, render_template, url_for

from .auth import user_count
from .db import get_db

bp = Blueprint("pages", __name__)


@bp.route("/")
def index():
    if user_count(get_db()) == 0:
        return redirect(url_for("auth.setup"))
    if g.user is None:
        return redirect(url_for("auth.login"))
    return render_template("app.html")


@bp.route("/favicon.ico")
def favicon():
    return ("", 204)
