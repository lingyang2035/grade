"""Grade 浏览器冒烟测试（可选，不属于 CI 必跑项）。

前置：
1. 使用一个**全新的数据库**启动服务，例如：
   GRADE_DATA_DIR=/tmp/grade-ui-data GRADE_DATABASE=/tmp/grade-ui-data/grade.db \
   GRADE_PORT=5050 ./venv/bin/python run.py
2. 安装 Playwright 与浏览器：
   ./venv/bin/pip install -r requirements-ui.txt
   ./venv/bin/python -m playwright install chromium-headless-shell
3. 运行：
   GRADE_UI_BASE=http://127.0.0.1:5050 ./venv/bin/python scripts/ui_smoke.py

如果本机已有 Playwright 缓存的 headless shell，可用 GRADE_UI_BROWSER 指定可执行文件。
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("GRADE_UI_BASE", "http://127.0.0.1:5050").rstrip("/")
BROWSER = os.environ.get("GRADE_UI_BROWSER") or None
SHOTS = Path(os.environ.get("GRADE_UI_SHOTS") or tempfile.mkdtemp(prefix="grade-ui-"))
ERRORS: list[str] = []


def log(*args):
    print(*args, flush=True)


def hidden(page, selector: str):
    page.wait_for_selector(selector, state="hidden", timeout=5000)


def nav_to(page, name: str):
    """点击桌面或手机导航中可见的入口。"""
    try:
        page.click(f'.top .nav button[data-view="{name}"]', timeout=3000)
    except Exception:
        page.click(f'.mobile-nav button[data-view="{name}"]', timeout=5000)


def main() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=BROWSER, headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on(
            "console",
            lambda message: ERRORS.append(f"console {message.type}: {message.text}")
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: ERRORS.append(f"pageerror: {error}"))
        try:
            # 1. 首次初始化
            page.goto(f"{BASE}/setup")
            page.fill('input[name="familyName"]', "张家")
            page.fill('input[name="studentName"]', "小明")
            page.select_option('select[name="grade"]', "初二")
            page.fill('input[name="className"]', "2 班")
            page.fill('input[name="username"]', "admin")
            page.fill('input[name="displayName"]', "张爸爸")
            page.fill('input[name="password"]', "password123")
            page.fill('input[name="confirmPassword"]', "password123")
            page.click('button[type="submit"]')
            page.wait_for_url(f"{BASE}/")
            log("1. 初始化完成")

            # 2. 录入考试（桌面端，原生下拉可见）
            nav_to(page, "history")
            page.click('#content [data-action="add"]')
            page.wait_for_selector("#exam-dialog")
            page.wait_for_selector("#exam-dialog", state="visible")
            page.fill('#exam-dialog input[name="name"]', "今日测验")
            page.select_option('#exam-dialog select[name="kind"]', "stage")
            page.select_option('#exam-dialog select[name="scope"]', "school")
            page.fill('#exam-dialog input[name="classRank"]', "10")
            page.fill('#exam-dialog input[name="gradeRank"]', "100")
            page.click('#exam-dialog button[data-action="exam-next"]')
            page.fill('#exam-dialog input[name="math-score"]', "100")
            page.click('#exam-form [data-exam-footer="2"] .button.primary')
            hidden(page, "#exam-dialog")
            page.wait_for_timeout(400)
            assert "已保存" in page.locator(".history-card").inner_text()
            assert page.locator("[data-saved-exam]").count() == 1
            nav_to(page, "overview")
            page.wait_for_timeout(300)
            assert "100" in page.locator(".stats").inner_text()
            log("2. 考试录入完成（保存后回到考试记录并标记已保存）")

            # 2.1 周测选科：只录数学、英语
            nav_to(page, "history")
            page.click('#content [data-action="add"]')
            page.wait_for_selector("#exam-dialog", state="visible")
            page.fill('#exam-dialog input[name="name"]', "班级周测")
            page.select_option('#exam-dialog select[name="kind"]', "weekly")
            page.select_option('#exam-dialog select[name="scope"]', "class")
            page.fill('#exam-dialog input[name="classRank"]', "5")
            page.click('#exam-dialog button[data-action="exam-next"]')
            page.click('#exam-dialog [data-pick-subject="math"]')
            page.click('#exam-dialog [data-pick-subject="english"]')
            page.fill('#exam-dialog input[name="math-score"]', "82")
            page.fill('#exam-dialog input[name="english-score"]', "90")
            page.click('#exam-form [data-exam-footer="2"] .button.primary')
            hidden(page, "#exam-dialog")
            page.wait_for_timeout(400)
            row_text = page.locator("[data-saved-exam]").inner_text()
            assert "172 / 200" in row_text and "2 科" in row_text
            log("2.1 周测只录两科，总分 172 / 200")

            # 2.5 设置：考试满分
            nav_to(page, "account")
            page.wait_for_timeout(300)
            page.click('#content [data-settings-tab="exam"]')
            page.click('#content [data-action="score-maxima"][data-template="regular"]')
            page.wait_for_selector("#detail-dialog", state="visible")
            page.fill('#detail-dialog input[name="math"]', "120")
            page.click('#detail-form .form-actions .button.primary')
            hidden(page, "#detail-dialog")
            page.wait_for_timeout(300)
            assert "数学 120" in page.locator("#content").inner_text()
            log("2.5 平时满分设置保存完成")

            # 2.6 新考试默认满分带入
            nav_to(page, "history")
            page.click('#content [data-action="add"]')
            page.wait_for_selector("#exam-dialog", state="visible")
            page.select_option('#exam-dialog select[name="kind"]', "stage")
            page.click('#exam-dialog button[data-action="exam-next"]')
            page.wait_for_timeout(200)
            assert page.locator('#exam-dialog input[name="math-max"]').input_value() == "120"
            page.click('#exam-dialog button[data-action="close-exam"]')
            hidden(page, "#exam-dialog")
            log("2.6 新考试默认满分带入正常")

            # 3. 题目证据 -> 练习 -> 复测
            nav_to(page, "overview")
            page.click(".spotlight button[data-review]")
            page.wait_for_timeout(300)
            page.click('button[data-action="evidence"]')
            page.wait_for_selector("#detail-dialog", state="visible")
            page.select_option('#detail-dialog select[name="subject"]', "math")
            page.fill('#detail-dialog input[name="question"]', "第 5 题")
            page.fill('#detail-dialog input[name="score"]', "3")
            page.fill('#detail-dialog input[name="max"]', "8")
            page.fill('#detail-dialog input[name="skill"]', "计算")
            page.click('#detail-form .form-actions .button.primary')
            hidden(page, "#detail-dialog")
            page.wait_for_timeout(300)

            page.click("button[data-plan]")
            page.wait_for_selector("#detail-dialog", state="visible")
            due = page.locator('#detail-dialog input[name="due"]').input_value()
            assert due, "练习默认日期为空"
            page.fill('#detail-dialog input[name="title"]', "重做同类题")
            page.click('#detail-form .form-actions .button.primary')
            hidden(page, "#detail-dialog")
            page.wait_for_timeout(300)

            page.click("button[data-retest]")
            page.wait_for_selector("#detail-dialog", state="visible")
            page.fill('#detail-dialog input[name="correct"]', "2")
            page.fill('#detail-dialog input[name="total"]', "3")
            page.click('#detail-form .form-actions .button.primary')
            hidden(page, "#detail-dialog")
            page.wait_for_timeout(300)
            assert "2 / 3" in page.locator(".task-result").inner_text()
            log("3. 复盘、练习、复测完成")

            # 4. 演示数据只读
            page.click("#mode-button")
            page.click('#mode-menu button[data-mode="demo"]')
            page.wait_for_timeout(400)
            assert page.locator("#mode-banner").is_visible()
            nav_to(page, "history")
            assert page.locator('#content [data-action="add"]').count() == 0
            page.click("#mode-button")
            page.click('#mode-menu button[data-mode="personal"]')
            page.wait_for_timeout(300)
            log("4. 演示数据只读切换正常")

            # 5. 管理员：新建家庭、改名、建学生账号
            nav_to(page, "account")
            page.wait_for_timeout(300)
            page.click('#content [data-settings-tab="admin"]')
            page.wait_for_timeout(300)
            page.click('.admin-families > summary')
            page.click('button[data-action="create-family"]')
            page.wait_for_selector("#detail-dialog", state="visible")
            page.fill('#detail-dialog input[name="name"]', "第二家")
            page.fill('#detail-dialog input[name="studentName"]', "小红")
            page.select_option('#detail-dialog select[name="grade"]', "初三")
            page.click('#detail-form .form-actions .button.primary')
            hidden(page, "#detail-dialog")
            page.wait_for_timeout(400)
            page.click('.admin-families > summary')
            page.click("button[data-edit-family]")
            page.wait_for_selector("#detail-dialog", state="visible")
            assert page.locator('#detail-dialog input[name]').evaluate_all("els => els.map(e => e.name)") == ["name"]
            page.fill('#detail-dialog input[name="name"]', "张家（新）")
            page.click('#detail-form .form-actions .button.primary')
            hidden(page, "#detail-dialog")
            page.wait_for_timeout(400)
            page.click('button[data-action="create-user"]')
            page.wait_for_selector("#detail-dialog", state="visible")
            page.fill('#detail-dialog input[name="username"]', "student1")
            page.fill('#detail-dialog input[name="name"]', "小明")
            page.select_option('#detail-dialog select[name="familyId"]', label="张家（新）")
            page.click('#detail-form .form-actions .button.primary')
            page.wait_for_selector(".temp-password strong", timeout=5000)
            temp = page.locator(".temp-password strong").inner_text()
            assert temp
            assert page.locator('[data-action="copy-password"]').count() == 1
            assert "关闭后无法再次查看" in page.locator("#copy-hint").inner_text()
            page.click('#detail-dialog [data-action="close-detail"]')
            hidden(page, "#detail-dialog")
            page.wait_for_timeout(300)
            assert page.locator(".temp-password strong").count() == 0
            log("5. 管理员建家庭/改名/建账号完成，临时密码可复制且关闭后清理")

            # 5.1 管理员删除考试 + 操作日志
            nav_to(page, "history")
            page.wait_for_timeout(300)
            first_name = page.locator(".history-card tbody tr").first.locator("b").inner_text()
            page.locator('.history-card tbody tr').first.locator('[data-action="delete-exam"]').click()
            page.wait_for_selector("#detail-dialog", state="visible")
            page.click('#detail-dialog [data-action="confirm-delete-exam"]')
            hidden(page, "#detail-dialog")
            page.wait_for_timeout(400)
            assert first_name not in page.locator(".history-card").inner_text()
            nav_to(page, "account")
            page.wait_for_timeout(300)
            page.click('#content [data-settings-tab="account"]')
            page.wait_for_timeout(200)
            page.click('#content [data-action="logs"]')
            page.wait_for_selector("#detail-dialog", state="visible")
            log_text = page.locator("#detail-dialog").inner_text()
            assert "删除考试" in log_text and "创建考试" in log_text
            page.click('#detail-dialog [data-action="close-detail"]')
            hidden(page, "#detail-dialog")
            log("5.1 管理员删除考试并查看操作日志完成")

            # 6. 普通成员登录、强制改密、权限可见性
            nav_to(page, "account")
            page.click('#content .account-actions button[type="submit"]')
            page.wait_for_url(f"{BASE}/login")
            page.fill('input[name="username"]', "student1")
            page.fill('input[name="password"]', temp)
            page.click('button[type="submit"]')
            page.wait_for_url(f"{BASE}/password")
            page.fill('input[name="currentPassword"]', temp)
            page.fill('input[name="newPassword"]', "student-pass-1")
            page.fill('input[name="confirmPassword"]', "student-pass-1")
            page.click('button[type="submit"]')
            page.wait_for_url(f"{BASE}/")
            page.wait_for_timeout(500)
            assert page.locator("#content .stats").count() > 0
            nav_to(page, "account")
            page.wait_for_timeout(300)
            page.click('#content [data-settings-tab="exam"]')
            page.wait_for_timeout(200)
            assert page.locator('#content [data-action="score-maxima"]').count() == 2
            nav_to(page, "history")
            page.wait_for_timeout(300)
            assert page.locator("#content button[data-edit]").count() > 0
            assert page.locator('#content [data-action="delete-exam"]').count() == 0
            # 普通成员也可以录入自己的考试。
            page.click('#content [data-action="add"]')
            page.wait_for_selector("#exam-dialog", state="visible")
            page.fill('#exam-dialog input[name="name"]', "成员自录周测")
            page.select_option('#exam-dialog select[name="kind"]', "weekly")
            page.select_option('#exam-dialog select[name="scope"]', "class")
            page.click('#exam-dialog button[data-action="exam-next"]')
            page.click('#exam-dialog [data-pick-subject="math"]')
            page.fill('#exam-dialog input[name="math-score"]', "88")
            page.click('#exam-form [data-exam-footer="2"] .button.primary')
            hidden(page, "#exam-dialog")
            page.wait_for_timeout(400)
            assert "成员自录周测" in page.locator(".history-card").inner_text()
            page.screenshot(path=str(SHOTS / "student-history.png"), full_page=True)
            log("6. 普通成员强制改密、权限可见性与自主录入考试完成")

            # 7. 手机尺寸
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(200)
            page.click('.mobile-nav button[data-view="overview"]')
            page.wait_for_timeout(300)
            page.screenshot(path=str(SHOTS / "mobile-overview.png"), full_page=True)
            log("7. 手机尺寸渲染完成")
        finally:
            browser.close()

    if ERRORS:
        raise SystemExit("浏览器控制台错误：\n" + "\n".join(ERRORS))
    log(f"UI smoke passed. 截图目录：{SHOTS}")


if __name__ == "__main__":
    main()
