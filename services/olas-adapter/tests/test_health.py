"""Health endpoint tests."""

from fastapi.testclient import TestClient

from synesis_olas.main import app


def test_health() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json()["service"] == "olas-adapter"
    assert response.json()["status"] == "ok"
