"""Database queries for the ingestion service."""

from typing import Any
import psycopg


def get_active_brands(database_url: str) -> list[dict[str, Any]]:
    """Retrieve all active tracked brands from PostgreSQL.

    Args:
        database_url: Connection string for PostgreSQL.

    Returns:
        List of active brand dictionaries with id, name, and keywords.
    """
    query = """
        SELECT id, name, keywords, competitor_names
        FROM tracked_brands
        WHERE is_active = true
        ORDER BY name;
    """
    brands: list[dict[str, Any]] = []
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(query)
            for row in cur.fetchall():
                brands.append({
                    "id": str(row[0]),
                    "name": row[1],
                    "keywords": list(row[2]) if row[2] else [],
                    "competitor_names": list(row[3]) if row[3] else [],
                })
    return brands
