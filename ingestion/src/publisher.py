"""Redis deduplication and stream publishing for ingested mentions."""

import json
from typing import Any
import redis

# 7 days in seconds
DEDUP_TTL_SECONDS = 604800
STREAM_NAME = "bp:mentions"
STREAM_MAXLEN = 100000


def get_dedup_key(brand_id: str, content_hash: str) -> str:
    """Format standard Redis key for mention deduplication."""
    return f"bp:dedup:{brand_id}:{content_hash}"


def is_new_mention(
    redis_client: redis.Redis,
    brand_id: str,
    content_hash: str,
    ttl: int = DEDUP_TTL_SECONDS,
) -> bool:
    """Check if mention has been processed in the last 7 days.

    Uses atomic 'SET NX EX' in Redis:
    - If key does not exist, sets it with TTL and returns True.
    - If key already exists, returns False.

    Args:
        redis_client: Active Redis client instance.
        brand_id: UUID of the brand.
        content_hash: SHA-256 hash of the mention.
        ttl: Expiration in seconds (defaults to 7 days).

    Returns:
        True if this mention is new; False if duplicate.
    """
    key = get_dedup_key(brand_id, content_hash)
    # redis-py returns True if SET NX succeeded, None if key already existed
    result = redis_client.set(key, "1", nx=True, ex=ttl)
    return bool(result)


def publish_mention(
    redis_client: redis.Redis,
    mention: dict[str, Any],
    stream_name: str = STREAM_NAME,
    maxlen: int = STREAM_MAXLEN,
) -> str:
    """Publish a validated mention to the Redis stream bp:mentions.

    Args:
        redis_client: Active Redis client instance.
        mention: Normalized mention dictionary.
        stream_name: Target Redis stream (default: bp:mentions).
        maxlen: Approximate maximum length for stream trimming.

    Returns:
        Generated Redis stream entry ID (e.g., '1728399999999-0').
    """
    payload_json = json.dumps(mention)
    entry_id = redis_client.xadd(
        name=stream_name,
        fields={"type": "mention.ingested", "payload": payload_json},
        maxlen=maxlen,
        approximate=True,
    )
    # decode if returned as bytes
    if isinstance(entry_id, bytes):
        return entry_id.decode("utf-8")
    return str(entry_id)
