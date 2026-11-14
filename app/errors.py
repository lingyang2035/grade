"""应用内可安全返回给客户端的错误类型。"""


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, code: str | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


class CsrfError(Exception):
    pass
