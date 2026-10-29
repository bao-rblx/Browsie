"""Unit tests for database connection pooling and health endpoint verification."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import db


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_endpoint_structure(client):
    """Ensure health endpoint provides detailed pool and component health."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")
    assert "database" in data
    assert "dialect" in data["database"]
    assert "status" in data["database"]
    assert data["database"]["status"] == "connected"


def test_database_health_check_function():
    """Directly invoke check_db_health to ensure pool connectivity."""
    status = db.check_db_health()
    assert status["status"] == "connected"
    assert status["dialect"] in ("sqlite", "postgresql")
    assert "pool_size" in status


def test_config_endpoint_returns_rules(client):
    """Ensure config endpoint returns valid detection rules and limits."""
    resp = client.get("/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "rulesetVersion" in data
    assert "rules" in data
    assert len(data["rules"]) > 0
    assert "sensitivity" in data
