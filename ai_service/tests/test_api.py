from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from src.api import app


client = TestClient(app)


def test_health_returns_connected_status(mocker):
    db_conn = MagicMock()
    db_context = mocker.patch("src.api.get_connection")
    db_context.return_value.__enter__.return_value = db_conn

    redis_client = MagicMock()
    redis_client.ping.return_value = True
    mocker.patch("src.api.get_redis_client", return_value=redis_client)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "db": "connected",
        "redis": "connected",
        "model": "all-MiniLM-L6-v2",
    }
    db_conn.cursor.return_value.__enter__.return_value.execute.assert_called_once_with("SELECT 1")


def test_embed_returns_vector_and_validates_empty_text(mocker):
    embedding = [0.1] * 384
    mock_generate = mocker.patch("src.api.generate_embedding", return_value=embedding)

    response = client.post("/embed", json={"text": "Deployment failures with 504 errors"})

    assert response.status_code == 200
    assert response.json()["dimensions"] == 384
    assert len(response.json()["embedding"]) == 384
    mock_generate.assert_called_once_with("Deployment failures with 504 errors")

    empty_response = client.post("/embed", json={"text": "   "})
    assert empty_response.status_code == 422


def test_embed_rejects_invalid_input():
    assert client.post("/embed", json={"text": ""}).status_code == 422
    assert client.post("/embed", json={"text": None}).status_code == 422
    assert client.post("/embed", json={}).status_code == 422


def test_sentiment_returns_score_and_label(mocker):
    mocker.patch("src.api.analyze_sentiment", return_value=(-0.75, "negative"))

    response = client.post("/sentiment", json={"text": "Every deployment is broken"})

    assert response.status_code == 200
    assert response.json() == {"score": -0.75, "label": "negative"}
