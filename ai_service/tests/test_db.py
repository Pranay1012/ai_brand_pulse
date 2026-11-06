from unittest.mock import MagicMock

import pytest

from src.db import (
    create_cluster,
    find_nearest_cluster,
    get_connection,
    save_mention,
    update_cluster_centroid,
)


def test_find_nearest_cluster_returns_cluster_when_similarity_above_threshold(mocker):
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = (
        "cluster-123",
        "brand-456",
        "Deploy failures",
        [0.2, 0.3],
        5,
        3,
        -0.6,
        "open",
        "2026-01-01T00:00:00Z",
        "2026-01-01T01:00:00Z",
        "2026-01-01T00:00:00Z",
        0.18,
    )
    cursor.description = [
        ("id",),
        ("brand_id",),
        ("title",),
        ("centroid",),
        ("mention_count",),
        ("negative_count",),
        ("avg_sentiment",),
        ("status",),
        ("first_seen_at",),
        ("last_seen_at",),
        ("created_at",),
        ("distance",),
    ]

    result = find_nearest_cluster(conn, "brand-456", [0.2, 0.3], threshold=0.82)

    assert result is not None
    assert result["id"] == "cluster-123"
    assert result["similarity"] == pytest.approx(0.82)
    assert result["distance"] == 0.18


def test_find_nearest_cluster_returns_none_when_similarity_below_threshold(mocker):
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = (
        "cluster-999",
        "brand-456",
        "Deploy failures",
        [0.3, 0.4],
        5,
        4,
        -0.8,
        "open",
        "2026-01-01T00:00:00Z",
        "2026-01-01T01:00:00Z",
        "2026-01-01T00:00:00Z",
        0.35,
    )
    cursor.description = [
        ("id",),
        ("brand_id",),
        ("title",),
        ("centroid",),
        ("mention_count",),
        ("negative_count",),
        ("avg_sentiment",),
        ("status",),
        ("first_seen_at",),
        ("last_seen_at",),
        ("created_at",),
        ("distance",),
    ]

    result = find_nearest_cluster(conn, "brand-456", [0.2, 0.3], threshold=0.82)

    assert result is None


def test_create_cluster_prepares_sql_and_returns_id(mocker):
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = ("cluster-abc",)

    cluster_id = create_cluster(conn, "brand-456", "Deploy failures", [0.2, 0.3], "negative")

    assert cluster_id == "cluster-abc"
    query = cursor.execute.call_args[0][0]
    params = cursor.execute.call_args[0][1]
    assert "INSERT INTO issue_clusters" in query
    assert params[0] == "brand-456"
    assert params[1] == "Deploy failures"
    assert params[2] == [0.2, 0.3]
    assert params[3] == 1
    assert params[4] == -1.0


def test_save_mention_handles_clustered_and_unclustered_inputs(mocker):
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = ("mention-123",)

    mention = {
        "brand_id": "brand-456",
        "source": "hacker_news",
        "external_id": "123",
        "url": "https://example.com/post",
        "author": "dev",
        "title": "Deploy failure",
        "content": "404 during deploy",
        "content_hash": "abc123",
        "published_at": "2026-01-01T12:00:00Z",
        "sentiment_score": -0.9,
        "sentiment_label": "negative",
        "embedding": [0.1, 0.2],
    }

    clustered_id = save_mention(conn, mention, "cluster-123")
    unclustered_id = save_mention(conn, mention, None)

    assert clustered_id == "mention-123"
    assert unclustered_id == "mention-123"

    cluster_params = cursor.execute.call_args_list[0].args[1]
    assert cluster_params[0] == "brand-456"
    assert cluster_params[1] == "cluster-123"
    assert cluster_params[10] == -0.9
    assert cluster_params[11] == "negative"
    assert cluster_params[12] == [0.1, 0.2]

    uncluster_params = cursor.execute.call_args_list[1].args[1]
    assert uncluster_params[1] is None


def test_get_connection_registers_vector_type(mocker):
    mock_conn = MagicMock()
    mock_register = mocker.patch("src.db.register_vector")
    mock_connect = mocker.patch("src.db.psycopg.connect", return_value=mock_conn)
    mocker.patch.dict("os.environ", {"DATABASE_URL": "postgresql://user:pass@localhost:5432/brandpulse"}, clear=False)

    connection = get_connection()

    assert connection is mock_conn
    mock_connect.assert_called_once_with("postgresql://user:pass@localhost:5432/brandpulse")
    mock_register.assert_called_once_with(mock_conn)


def test_update_cluster_centroid_updates_running_statistics(mocker):
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = ([0.2, 0.3], 2, 0.2, 1)

    update_cluster_centroid(conn, "cluster-123", [0.4, 0.5], -0.8)

    assert cursor.execute.call_count == 2
    update_query = cursor.execute.call_args_list[1].args[0]
    update_params = cursor.execute.call_args_list[1].args[1]
    assert "UPDATE issue_clusters" in update_query
    assert update_params[0] == pytest.approx([0.26666666666666666, 0.36666666666666664])
    assert update_params[1] == 2
    assert update_params[2] == pytest.approx(-0.13333333333333333)
    assert update_params[3] == "cluster-123"
