import json
import fakeredis
import pytest
from src.publisher import is_new_mention, publish_mention, STREAM_NAME, DEDUP_TTL_SECONDS


@pytest.fixture
def fake_redis_client():
    """Create an isolated, in-memory fake Redis client for testing."""
    return fakeredis.FakeRedis()


def test_is_new_mention_first_time_returns_true(fake_redis_client):
    brand_id = "33333333-3333-3333-3333-333333333333"
    content_hash = "a" * 64

    # First time seeing this mention
    is_new = is_new_mention(fake_redis_client, brand_id, content_hash)
    assert is_new is True

    # Check key exists in Redis and has a TTL set
    key = f"bp:dedup:{brand_id}:{content_hash}".encode("utf-8")
    assert fake_redis_client.exists(key) == 1
    ttl = fake_redis_client.ttl(key)
    assert 0 < ttl <= DEDUP_TTL_SECONDS


def test_is_new_mention_duplicate_returns_false(fake_redis_client):
    brand_id = "33333333-3333-3333-3333-333333333333"
    content_hash = "b" * 64

    # First attempt: Accepted as new
    assert is_new_mention(fake_redis_client, brand_id, content_hash) is True

    # Second attempt with identical brand and content_hash: Rejected as duplicate
    assert is_new_mention(fake_redis_client, brand_id, content_hash) is False

    # Third attempt: Still duplicate
    assert is_new_mention(fake_redis_client, brand_id, content_hash) is False


def test_is_new_mention_different_brands_or_hashes(fake_redis_client):
    brand_a = "11111111-1111-1111-1111-111111111111"
    brand_b = "22222222-2222-2222-2222-222222222222"
    hash_1 = "c" * 64
    hash_2 = "d" * 64

    # Different hashes for same brand
    assert is_new_mention(fake_redis_client, brand_a, hash_1) is True
    assert is_new_mention(fake_redis_client, brand_a, hash_2) is True

    # Same hash for different brands
    assert is_new_mention(fake_redis_client, brand_b, hash_1) is True


def test_publish_mention_appends_to_stream(fake_redis_client):
    mention = {
        "brand_id": "33333333-3333-3333-3333-333333333333",
        "source": "hacker_news",
        "external_id": "1001",
        "url": "https://news.ycombinator.com/item?id=1001",
        "author": "tester",
        "title": "Vercel 504 Timeout",
        "content": "Deploy failed with 504 timeout error.",
        "published_at": "2026-10-08T12:00:00Z",
        "content_hash": "e" * 64,
    }

    entry_id = publish_mention(fake_redis_client, mention)
    assert entry_id is not None

    # Verify stream length is exactly 1
    assert fake_redis_client.xlen(STREAM_NAME) == 1

    # Read back the stream entry
    messages = fake_redis_client.xrange(STREAM_NAME)
    assert len(messages) == 1

    msg_id, fields = messages[0]
    # Check fields
    # fakeredis keys/values may be bytes
    field_dict = {
        (k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
        for k, v in fields.items()
    }
    assert field_dict["type"] == "mention.ingested"

    payload = json.loads(field_dict["payload"])
    assert payload["external_id"] == "1001"
    assert payload["title"] == "Vercel 504 Timeout"
    assert payload["content_hash"] == "e" * 64
