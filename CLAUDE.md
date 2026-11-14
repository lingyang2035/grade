# CLAUDE.md — Grade

行为准则见全局 `~/.claude/CLAUDE.md`。本文件只记录本项目不显然、容易踩错的约定。

## 项目身份

- **Grade**：上海中考学生/家庭成绩记录、复盘、练习与复测应用。
- **当前阶段**：正式版核心闭环已完成；原型设计在本地 `doc/`（不纳入版本库），`doc/index.html` 是视觉与交互基准，保留不动。
- **技术栈**：Python 3.14 / Flask 3.1 / SQLite / Waitress；前端为无构建链的原生 ES Modules + 原型 CSS。
- **部署方向**：Nginx HTTPS 子路径 `/grade/` → Waitress → Flask → SQLite；生产部署与运维文档仅保存在本地，不纳入版本库。
- **当前交接**：本地 `handover.md`（运行状态、最近变更、后续计划，不纳入版本库）。

## 运行与验证

```bash
./venv/bin/python run.py          # 开发，http://localhost:5000
./venv/bin/python -m pytest -q    # 59 项测试；改后端后必须全绿
node --check --input-type=module < app/static/js/main.js  # 单文件 JS 语法检查
```

- `run.py` 默认 **不自动重载**：改 Python 后必须重启；Jinja 模板也会缓存，改 `app/templates/` 后同样必须重启。
- 静态资源 `SEND_FILE_MAX_AGE_DEFAULT=0`，改 CSS/JS 后刷新页面即可；若浏览器仍吃旧缓存，强制刷新。
- 实际 UI 验证用 Playwright + 已缓存的 `chrome-headless-shell`（路径见 `/home/lingy/.cache/ms-playwright/`）；可跑 `GRADE_UI_BROWSER=... GRADE_UI_BASE=... ./venv/bin/python scripts/ui_smoke.py`（需空数据库），不引入前端构建链。

## 架构不变量（改代码前先看）

1. **家庭隔离**：所有学习数据表都有 `family_id`；API 查询必须同时带 `family_id`。管理员接口只返回家庭/账号身份，绝不返回其他家庭成绩。
2. **SSOT 在后端**：科目、考试类型、范围、状态、2026 计分模板、模拟中考满分只在 `app/domain.py` 定义；前端通过 `/api/bootstrap` 的 `meta` 使用，**不要在 JS 里复制一份**。家庭自己的“中考/平时满分默认值”存在 `score_maxima` 表（家庭快照 `data.scoreMaxima`），默认模板在 `app/domain.py` 的 `SCORE_MAX_TEMPLATES`。
3. **写接口返回完整家庭快照**：任何写操作成功后返回 `{data: familySnapshot, ...}`；前端 `core.applyFamilyData()` 直接替换，不自行拼装跨表状态。
4. **演示数据只读**：`app/data.py` 的 `DEMO` 是服务端深拷贝快照；前端切到 demo 只读，所有写操作在 UI 和 API 层都不存在 demo 写入路径。
5. **权限在服务端**：不区分家长/学生，所有家庭成员权限一致，可录入考试、维护学习设置、写题目证据/练习/复测；仅管理员可删除考试、管理账号、查看全部家庭的审计日志。管理员权限不授予其他家庭成绩读写权。前端隐藏按钮只是体验，服务端装饰器是边界。
6. **人数快照**：新考试取当前班级/年级人数；编辑考试沿用原考试人数；设置变更不重算历史。
7. **模拟中考**：满分默认取家庭的 `scoreMaxima.mock` 模板，本场可逐科修改；总分按已录科目的得分和满分加总。缺科（未录满全部科目）时 `total.partialMock=true` 且 `signature=null`；非模拟考试同样按实际录入科目求和。
8. **CSRF**：所有 `/api/` 写请求必须带 `X-CSRF-Token`；登录/初始化/改密表单使用隐藏 `csrf_token`。新增写接口时不要绕过 `app/__init__.py` 的全局检查。
9. **初始化入口**：数据库无用户时 `/setup` 可用；创建首个管理员后自动关闭。不要把初始化页改成登录后可访问。
10. **会话失效**：改密/管理员重置会递增 `users.session_version`；旧会话在 `load_user` 里被清除。改认证逻辑时保持这一点。

## 目录速查

| 路径 | 职责 |
| --- | --- |
| `app/__init__.py` | 应用工厂、配置、ProxyFix、CSP/安全头、错误处理、API CSRF |
| `app/auth.py` | setup/login/logout/password、权限装饰器、CSRF、登录限流 |
| `app/api.py` | 家庭学习数据 API（考试、设置、证据、练习、账号称呼） |
| `app/admin_api.py` | 家庭/账号管理（仅管理员；不读跨家庭成绩） |
| `app/domain.py` | 常量 + 校验 + 总分/排名规则（SSOT） |
| `app/data.py` | 家庭快照、管理员快照、演示数据 |
| `app/schema.sql` | SQLite schema（当前版本 3；`app/db.py:_migrate` 做最小迁移） |
| `app/static/js/main.js` | 引导、路由、事件委托、表单提交、API 调用 |
| `app/static/js/core.js` | 全局 state、派生数据、格式化/计算助手 |
| `app/static/js/views/` | 各页面渲染（overview/history/subjects/review/week/account/admin） |
| `app/static/js/dialogs.js` | 考试录入、题目证据、练习、复测、管理员表单 |
| `scripts/ui_smoke.py` | 可选浏览器冒烟（需空数据库 + Playwright） |
| `doc/`（本地） | 原型与设计资料，**不纳入版本库**；`index.html` 不是运行时页面 |

## 前端约定

- 视图函数返回 HTML 字符串；所有用户内容经过 `escapeHtml`。不要用 `innerHTML` 插入未转义的用户输入。
- 页面切换用 `goTo(view)`，数据变更后 `render()`；深链接不是当前需求。
- 事件统一在 `main.js` 委托；新增交互优先加 `data-*` 属性，避免散落监听器。
- 表单提交用 `withSubmit()` 防止重复提交；错误写入 `#exam-error` / `#detail-error`，没有错误位时 `announce()`。
- 新增页面时：视图放 `views/`，导入 `core`/`shared`/`charts`；不要反向依赖 `main.js`。
- CSS 从原型移植在 `app/static/css/app.css`，正式版补充样式在文件末尾「Grade 正式版补充样式」段；不要再引入第二套设计 token。

## 数据库与运维

- 默认数据库 `data/grade.db`；密钥 `data/secret_key`。两者都在 `.gitignore`。
- 重置本地数据：停服务 → 删除 `data/grade.db`、`grade.db-wal`、`grade.db-shm` → 重启（会清空全部账号与记录）。
- 生产备份/恢复与启动方式仅保存在本地运维文档，不纳入版本库。
- 子路径依赖 `X-Forwarded-Prefix` + `ProxyFix(x_prefix=1)`；Nginx 必须传该头，否则 `url_for`/静态资源/登录跳转会丢 `/grade` 前缀。
- Cookie 默认 `Path=/`；Nginx 用 `proxy_cookie_path / /grade/;` 重写（或设置 `GRADE_COOKIE_PATH`），HTTPS 下 `GRADE_COOKIE_SECURE=1`。

## 已知边界（不要误以为已实现）

- 中考模板固定 2026；年度模板维护未实现。
- 中考计分台账已在 V0.2 移除；审计日志记录考试创建/修改/删除，保留最近查询 100 条。
- 导入/导出、备份恢复 UI 未实现。
- 无邮件/短信密码找回；只能管理员重置。
- 登录限流是单进程内存状态；多进程/多实例部署需外部限流。
- 无数据库迁移框架；schema 变更需在 `app/db.py:_migrate` 按版本手写迁移。
- 模拟中考整场各科满分合计必须为 750；其他总满分请用普通考试类型。
- 管理员可新增家庭、修改家庭名称、管理账号；学生档案（称呼/年级/班级）在「设置」中维护；管理员不可查看其他家庭成绩。
- 原型中的“账号切换/角色切换”已替换为真实登录身份；不要恢复演示式切换。

## 修改后必做

1. 后端改动：`./venv/bin/python -m pytest -q` 全绿。
2. 前端改动：至少用 Playwright 打开首页、录入考试、复盘、管理员建号并检查 console 无错误；移动宽度 390px 检查底部导航。
3. 涉及权限/数据隔离：补/改对应测试（`tests/test_isolation.py`、`test_admin.py`、`test_auth.py`）。
4. 涉及部署配置：同步更新 `doc/deploy.md`。
