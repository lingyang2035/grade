# Grade

上海中考学生与家庭的学习记录应用：录入考试成绩、对照目标、从题目证据定位薄弱点、安排练习并用复测验证效果。

- **版本**：V0.2.2（版本号同时显示在登录页与设置页）
- **形态**：单页 Web 应用，桌面与手机共用一套响应式页面
- **数据**：单进程 SQLite，按家庭隔离

## 功能概览

- **家庭与账号**：首次启动创建管理员和第一个家庭；管理员新增家庭、创建账号、启用/停用、重置临时密码。账号按家庭隔离，管理员不读取其他家庭成绩。
- **权限**：家庭成员权限一致，可录入考试、维护学习设置、记录题目证据与练习；管理员额外可删除考试、管理账号、查看全部家庭的审计日志。
- **考试录入**：阶段测验/月考、期中/期末、周测/机构、模拟中考等类型；本班/本校/区级/校外机构等范围；班级与年级名次、参考人数快照。
- **成绩分析**：本场分析（目标对照、排名与目标、卷面失分、复盘重点、各科明细）、成绩对照（近 5 场）、历次趋势。
- **能力分析**：单科跨场的题目表现矩阵（按知识点或技能）、练习与复测、得分率趋势。
- **考后复盘**：按学科记录题号、得分、满分、知识点、技能、题型与错因；汇总题目失分并与卷面失分对账；可安排练习、记录复测。
- **练习与复测**：从题目证据安排练习，记录正确题数/总题数、题目来源、完成方式与复测发现。
- **审计日志**：记录考试的创建/修改/删除（操作人、时间、家庭、摘要），成员看本家庭，管理员看全部。
- **学习设置**：学习档案、班级/年级人数、阶段排名目标、各科目标得分率、中考与平时两套满分模板。
- **演示数据**：任何账号可切换到只读示例数据，不写入数据库。

## 技术栈

- Python 3.11+ / Flask 3.1 / SQLite（WAL）/ Waitress
- 前端无构建链：原生 ES Modules + 模板 CSS，服务端只提供应用外壳
- 测试：pytest + 可选 Playwright 浏览器冒烟

## 快速开始

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements-dev.txt
./venv/bin/python run.py
```

打开 <http://localhost:5000>。首次进入显示初始化页面，创建家庭资料与管理员账号后自动登录。

- 开发入口：`run.py`（默认 `0.0.0.0:5000`，`GRADE_DEBUG=1` 开启 Flask 调试；不自动重载，改 Python 或模板后需重启）
- 生产入口：`serve.py`（Waitress，默认 `0.0.0.0:9102`）
- 数据库：默认 `data/grade.db`，首次启动自动建表
- 重置本地数据：停止服务后删除 `data/grade.db*`（会清空全部账号与记录，谨慎）

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `GRADE_DATA_DIR` | `./data` | 数据目录，存放数据库与默认密钥文件 |
| `GRADE_DATABASE` | `$GRADE_DATA_DIR/grade.db` | SQLite 文件路径 |
| `GRADE_SECRET_KEY` | 自动生成 | Flask 会话签名密钥；生产建议显式设置 |
| `GRADE_SECRET_KEY_FILE` | `$GRADE_DATA_DIR/secret_key` | 密钥文件路径 |
| `GRADE_COOKIE_SECURE` | `0` | HTTPS 环境设为 `1` |
| `GRADE_COOKIE_PATH` | `/` | 子路径部署时使用 |
| `GRADE_HOST` | `0.0.0.0` | 监听地址 |
| `GRADE_PORT` | `5000`（run）/ `9102`（serve） | 监听端口 |
| `GRADE_THREADS` | `4` | Waitress 线程数 |
| `GRADE_DEBUG` | `0` | 仅开发入口使用 |

## 测试

```bash
./venv/bin/python -m pytest -q     # 59 项后端测试
```

覆盖：初始化、登录/退出、强制改密与重置、CSRF、家庭隔离、管理员权限、模拟中考与总分、排名占比、人数快照、设置、题目证据唯一性、练习复测、审计日志、演示快照、安全响应头与子路径 URL。

可选的浏览器冒烟（需要 Playwright 与一个全新数据库的本地服务）：

```bash
./venv/bin/pip install -r requirements-ui.txt
GRADE_DATA_DIR=/tmp/grade-ui-data GRADE_DATABASE=/tmp/grade-ui-data/grade.db GRADE_PORT=5050 ./venv/bin/python run.py
GRADE_UI_BASE=http://127.0.0.1:5050 ./venv/bin/python scripts/ui_smoke.py
```

## 权限模型

- **家庭**：共享一份学习记录，家庭成员权限一致。
- **管理员**：独立权限位；可删除考试、管理账号/家庭、查看全部审计日志，但不能读取其他家庭成绩。
- **初始化**：数据库无账号时 `/setup` 可用；创建首个管理员后自动关闭。
- **会话**：改密或管理员重置会递增 `session_version`，旧会话立即失效。
- **隐私**：跨家庭只暴露家庭/账号身份信息，不提供成绩读取接口。

## 数据口径

- **模拟中考**：各科满分默认取家庭模板（合计必须 750）；缺科时总分为已录小计，且不参与完整总分比较。
- **其他考试**：按实际录入科目的得分与满分分别求和；总分比较要求类型、范围与满分签名一致。
- **满分模板**：中考/平时两套默认值，录入时自动带入、本场可改；历史考试保留当时的满分。
- **考试状态**：未考/待公布/缺考不产生得分，真实录入的 0 分是有效成绩。
- **人数快照**：新考试保存当时的班级/年级人数，之后修改设置不重算历史。
- **目标**：家庭自定义，历史考试也对照当前目标；目标不代表录取线或能力诊断。

## 目录结构

```text
grade/
├── app/
│   ├── __init__.py        # 应用工厂、配置、安全头、错误处理、CSRF 检查
│   ├── auth.py            # 初始化、登录、改密、权限装饰器
│   ├── api.py             # 家庭学习数据 API（考试/证据/练习/设置/日志）
│   ├── admin_api.py       # 管理员家庭与账号 API
│   ├── pages.py           # 页面路由
│   ├── db.py              # SQLite 连接、schema 初始化与版本迁移
│   ├── domain.py          # 科目/考试类型/满分模板/校验/总分规则（SSOT）
│   ├── data.py            # 家庭快照、管理员快照、演示数据
│   ├── schema.sql         # 数据库结构（当前 v3）
│   ├── templates/         # 登录/初始化/改密/应用外壳
│   └── static/
│       ├── css/app.css    # 设计移植 + 正式版补充样式
│       └── js/            # api/core/charts/dialogs/main + views/
├── tests/                 # pytest
├── scripts/ui_smoke.py    # 可选 Playwright 冒烟
├── run.py                 # 开发入口
├── serve.py               # Waitress 生产入口
├── CHANGELOG.md           # 版本更新记录
├── CLAUDE.md              # 项目开发约定
└── requirements*.txt
```

## 安全

- 会话 Cookie：HttpOnly、SameSite=Lax，生产可加 Secure。
- 所有写接口要求会话内 CSRF token（`X-CSRF-Token`）。
- 密码使用 Werkzeug `scrypt` 哈希；不存明文。
- SQL 全部参数化；家庭级查询统一带 `family_id`。
- 响应头：CSP、`X-Frame-Options: DENY`、`nosniff`、`Referrer-Policy: same-origin`。
- 登录失败按 IP+账号做 10 分钟窗口限流（单进程内存状态）。

## 已知边界

- 中考模板固定 2026 年，年度模板维护未实现。
- 导入/导出、备份恢复界面未实现。
- 密码找回依赖管理员重置，无邮件/短信找回。
- 登录限流为单进程内存状态；多进程部署需要外部限流。
- schema 变更通过 `app/db.py:_migrate` 按版本迁移；当前版本 3。
- 无前端构建链，页面为服务端外壳 + 原生 ES Modules。

## 更新记录

见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

暂未指定。如需开源分发，请补充 `LICENSE` 文件。
