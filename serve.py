#!/usr/bin/env python3
"""生产入口：使用 Waitress 启动 Flask 应用。"""

import os

from waitress import serve

from app import create_app

app = create_app()

if __name__ == "__main__":
    host = os.environ.get("GRADE_HOST", "0.0.0.0")
    port = int(os.environ.get("GRADE_PORT", "9102"))
    threads = int(os.environ.get("GRADE_THREADS", "4"))
    serve(app, host=host, port=port, threads=threads)
