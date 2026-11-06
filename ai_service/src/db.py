import os
from typing import Any

import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from psycopg.types.json import Jsonb


def get_connection() -> psycopg.Connection[Any]:
    """Create and return a PostgreSQL connection with pgvector registered."""
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        conninfo = database_url
    else:
        host = os.getenv("POSTGRES_HOST", "localhost")
        port = os.getenv("POSTGRES_PORT", "5432")
        db_name = os.getenv("POSTGRES_DB", "brandpulse")
        user = os.getenv("POSTGRES_USER", "postgres")
        password = os.getenv("POSTGRES_PASSWORD", "postgres")
        conninfo = (
            f"host={host} port={port} dbname={db_name} "
            f"user={user} password={password}"
        )

    conn = psycopg.connect(conninfo)
    register_vector(conn)
    return conn


def _row_to_dict(cursor: Any, row: Any) -> dict[str, Any] | None:
    if row is None:
        return None
    description = getattr(cursor, "description", None) or []
    columns = [col[0] for col in description]
    return {column: value for column, value in zip(columns, row)}


def find_nearest_cluster(
    conn: Any,
    brand_id: str,
    embedding: list[float],
    threshold: float = 0.82,
) -> dict[str, Any] | None:
    """Return the closest open cluster matching a brand embedding."""
    query = """
        SELECT
            id,
            brand_id,
            title,
            centroid,
            mention_count,
            negative_count,
            avg_sentiment,
            status,
            first_seen_at,
            last_seen_at,
            created_at,
            centroid <=> %s AS distance
        FROM issue_clusters
        WHERE brand_id = %s
          AND status = 'open'
          AND last_seen_at > now() - interval '30 days'
        ORDER BY centroid <=> %s
        LIMIT 1;
    """

    with conn.cursor() as cur:
        cur.execute(query, (embedding, brand_id, embedding))
        row = cur.fetchone()
        if row is None:
            return None

        cluster = _row_to_dict(cur, row)
        if cluster is None:
            return None

        distance = float(cluster.get("distance", 1.0))
        similarity = 1.0 - distance
        cluster["distance"] = distance
        cluster["similarity"] = similarity
        if similarity < threshold:
            return None
        return cluster


def create_cluster(
    conn: Any,
    brand_id: str,
    title: str,
    embedding: list[float],
    initial_sentiment: str,
) -> str:
    """Insert and return a new issue cluster id."""
    sentiment_key = str(initial_sentiment or "").lower()
    sentiment_score = {
        "negative": -1.0,
        "neutral": 0.0,
        "positive": 1.0,
    }.get(sentiment_key, 0.0)
    negative_count = 1 if sentiment_key == "negative" else 0

    query = """
        INSERT INTO issue_clusters (
            brand_id,
            title,
            centroid,
            mention_count,
            negative_count,
            avg_sentiment,
            status,
            first_seen_at,
            last_seen_at
        )
        VALUES (%s, %s, %s, 1, %s, %s, 'open', NOW(), NOW())
        RETURNING id;
    """

    with conn.cursor() as cur:
        cur.execute(query, (brand_id, title, embedding, negative_count, sentiment_score))
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("Failed to create cluster")
        return str(row[0])


def save_mention(conn: Any, mention_data: dict[str, Any], cluster_id: str | None) -> str:
    """Persist a mention row and return its generated id."""
    query = """
        INSERT INTO mentions (
            brand_id,
            cluster_id,
            source,
            external_id,
            url,
            author,
            title,
            content,
            content_hash,
            published_at,
            sentiment_score,
            sentiment_label,
            embedding
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
    """

    params = (
        mention_data.get("brand_id"),
        cluster_id,
        mention_data.get("source"),
        mention_data.get("external_id"),
        mention_data.get("url"),
        mention_data.get("author"),
        mention_data.get("title"),
        mention_data.get("content"),
        mention_data.get("content_hash"),
        mention_data.get("published_at"),
        mention_data.get("sentiment_score", 0.0),
        mention_data.get("sentiment_label", "neutral"),
        mention_data.get("embedding"),
    )

    with conn.cursor() as cur:
        cur.execute(query, params)
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("Failed to save mention")
        return str(row[0])


def update_cluster_centroid(
    conn: Any,
    cluster_id: str,
    new_embedding: list[float],
    sentiment_score: float,
) -> None:
    """Update the cluster centroid using an incremental average."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT centroid, mention_count, avg_sentiment, negative_count
            FROM issue_clusters
            WHERE id = %s;
            """,
            (cluster_id,),
        )
        row = cur.fetchone()
        if row is None:
            return

        current_centroid = np.asarray(row[0], dtype=float)
        mention_count = int(row[1] or 0)
        avg_sentiment = float(row[2] or 0.0)
        negative_count = int(row[3] or 0)

        new_vector = np.asarray(new_embedding, dtype=float)
        next_count = mention_count + 1
        updated_centroid = (
            ((current_centroid * mention_count) + new_vector) / next_count
            if mention_count > 0
            else new_vector
        )
        updated_avg_sentiment = (
            ((avg_sentiment * mention_count) + sentiment_score) / next_count
            if mention_count > 0
            else sentiment_score
        )
        updated_negative_count = negative_count + (1 if sentiment_score <= -0.05 else 0)

        cur.execute(
            """
            UPDATE issue_clusters
            SET centroid = %s,
                mention_count = mention_count + 1,
                negative_count = %s,
                avg_sentiment = %s,
                last_seen_at = NOW()
            WHERE id = %s;
            """,
            (updated_centroid.tolist(), updated_negative_count, updated_avg_sentiment, cluster_id),
        )


def get_cluster(conn: Any, cluster_id: str) -> dict[str, Any] | None:
    query = """
        SELECT id, brand_id, title, mention_count, negative_count, avg_sentiment, status
        FROM issue_clusters
        WHERE id = %s;
    """
    with conn.cursor() as cur:
        cur.execute(query, (cluster_id,))
        row = cur.fetchone()
        return _row_to_dict(cur, row)


def get_cluster_mentions(conn: Any, cluster_id: str, limit: int = 10) -> list[dict[str, Any]]:
    query = """
        SELECT id, title, content, source, url, author, sentiment_score, sentiment_label, published_at
        FROM mentions
        WHERE cluster_id = %s
        ORDER BY published_at DESC NULLS LAST, created_at DESC
        LIMIT %s;
    """
    with conn.cursor() as cur:
        cur.execute(query, (cluster_id, limit))
        rows = cur.fetchall()
        columns = [col[0] for col in (cur.description or [])]
        return [{column: value for column, value in zip(columns, row)} for row in rows]


def has_active_action(conn: Any, cluster_id: str) -> bool:
    query = """
        SELECT EXISTS (
            SELECT 1 FROM actions
            WHERE cluster_id = %s AND status IN ('pending', 'approved')
        );
    """
    with conn.cursor() as cur:
        cur.execute(query, (cluster_id,))
        row = cur.fetchone()
        return bool(row[0]) if row else False


def save_action(
    conn: Any,
    cluster_id: str,
    brand_id: str,
    payload: dict[str, Any],
    rationale: str,
    action_type: str = "jira_ticket",
) -> str | None:
    if action_type not in {"jira_ticket", "pr_response", "sales_counter_hook"}:
        raise ValueError(f"Unsupported action type: {action_type}")

    query = """
        INSERT INTO actions (
            cluster_id, brand_id, action_type, status, payload, rationale
        )
        VALUES (%s, %s, %s, 'pending', %s, %s)
        ON CONFLICT DO NOTHING
        RETURNING id;
    """
    with conn.cursor() as cur:
        cur.execute(query, (cluster_id, brand_id, action_type, Jsonb(payload), rationale))
        row = cur.fetchone()
        return str(row[0]) if row else None
