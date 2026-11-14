import pytest

from app import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret-key",
            "DATA_DIR": str(tmp_path / "data"),
            "DATABASE": str(tmp_path / "grade.db"),
            "SESSION_COOKIE_SECURE": False,
        }
    )


@pytest.fixture
def client(app):
    with app.test_client() as client:
        yield client
