import hashlib
import json
import logging
import os
import signal
import threading
from datetime import datetime, timezone
from typing import Any

import redis
from redis.exceptions import ResponseError

from src.db import (
    create_cluster,
    find_nearest_cluster,
    get_cluster,
    get_cluster_mentions,
    get_connection,
    has_active_action,
    save_action,
    save_mention,
    update_cluster_centroid,
)
from src.embedding import generate_embedding
from src.llm import synthesize_action
from src.sentiment import analyze_sentiment
from src.triggers import evaluate_trigger

STREAM_NAME = "bp:mentions"
GROUP_NAME = "ai-engine"
CONSUMER_NAME = f"consumer-{os.getpid()}"

logger = logging.getLogger(__name__)


def get_redis_client() -> redis.Redis:
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        return redis.Redis.from_url(redis_url, decode_responses=True)

    host = os.getenv("REDIS_HOST", "localhost")
    port = int(os.getenv("REDIS_PORT", "6379"))
    password = os.getenv("REDIS_PASSWORD")
    return redis.Redis(host=host, port=port, password=password, decode_responses=True)


def ensure_consumer_group(redis_client: redis.Redis | None = None) -> None:
    client = redis_client or get_redis_client()
    try:
        client.xgroup_create(STREAM_NAME, GROUP_NAME, id="$", mkstream=True)
    except ResponseError as exc:
        if "BUSYGROUP" not in str(exc).upper():
            raise


def _decode(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return value


def _decode_message(message_data: dict[str, Any]) -> dict[str, Any]:
    decoded = {_decode(key): _decode(value) for key, value in message_data.items()}
    raw_payload = decoded.get("raw_payload") or decoded.get("payload") or decoded.get("content") or ""
    if isinstance(raw_payload, str):
        try:
            parsed = json.loads(raw_payload)
        except json.JSONDecodeError:
            parsed = decoded
    elif isinstance(raw_payload, dict):
        parsed = raw_payload
    else:
        parsed = decoded

    if not isinstance(parsed, dict):
        parsed = decoded

    combined = dict(decoded)
    combined.update(parsed)
    combined["raw_payload"] = raw_payload
    return combined


def _cluster_title(text: str, _raw_payload: Any = None) -> str:
    title = (text or "").strip().replace("\n", " ")
    if not title:
        return "Untitled brand mention"
    if len(title) <= 80:
        return title
    return title[:77].rstrip() + "..."


def process_mention(message_data: dict[str, Any], conn: Any) -> dict[str, Any]:
    """Analyze, cluster, and persist one ingested mention."""
    payload = _decode_message(message_data)
    text = payload.get("text") or payload.get("content") or payload.get("title") or ""
    brand_id = payload.get("brand_id")
    if not brand_id:
        raise ValueError("Incoming mention payload is missing brand_id")

    sentiment_score, sentiment_label = analyze_sentiment(str(text))
    embedding = generate_embedding(str(text))
    cluster = find_nearest_cluster(conn, str(brand_id), embedding, threshold=0.82)

    cluster_id = None
    action = "unclustered"
    if cluster is not None:
        cluster_id = str(cluster["id"])
        update_cluster_centroid(conn, cluster_id, embedding, sentiment_score)
        action = "cluster_updated"
    elif sentiment_label in ("negative", "neutral"):
        title = _cluster_title(str(text), payload.get("raw_payload"))
        cluster_id = create_cluster(conn, str(brand_id), title, embedding, sentiment_label)
        action = "cluster_created"

    content_hash = str(payload.get("content_hash") or "").strip()
    if not content_hash:
        normalized = " ".join(str(text).split()).casefold()
        content_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    external_id = str(
        payload.get("external_id")
        or payload.get("objectID")
        or payload.get("id")
        or content_hash
    )
    mention_dict = {
        "brand_id": str(brand_id),
        "source": payload.get("source", "unknown"),
        "external_id": external_id,
        "url": payload.get("url") or "",
        "author": payload.get("author"),
        "title": payload.get("title") or "",
        "content": str(text),
        "content_hash": content_hash,
        "published_at": payload.get("published_at") or datetime.now(timezone.utc).isoformat(),
        "sentiment_score": sentiment_score,
        "sentiment_label": sentiment_label,
        "embedding": embedding,
    }
    mention_id = save_mention(conn, mention_dict, cluster_id)

    action_id = None
    if cluster_id is not None:
        cluster_metrics = get_cluster(conn, cluster_id)
        if cluster_metrics and evaluate_trigger(cluster_metrics) and not has_active_action(conn, cluster_id):
            mentions = get_cluster_mentions(conn, cluster_id)
            drafted_action = synthesize_action(str(cluster_metrics.get("title", "BrandPulse incident")), mentions)
            action_id = save_action(
                conn,
                cluster_id=cluster_id,
                brand_id=str(cluster_metrics.get("brand_id", brand_id)),
                payload=drafted_action,
                rationale="Cluster reached the negative sentiment and mention volume threshold.",
                action_type="jira_ticket",
            )
            if action_id:
                action = "action_created"

    return {
        "mention_id": mention_id,
        "cluster_id": cluster_id,
        "sentiment_score": sentiment_score,
        "sentiment_label": sentiment_label,
        "action": action,
        "action_id": action_id,
    }


def _decoded_id(message_id: Any) -> str:
    return _decode(message_id)


def start_consumer(redis_client: redis.Redis | None = None, stop_event: threading.Event | None = None) -> None:
    """Continuously consume, process, and acknowledge Redis stream messages."""
    client = redis_client or get_redis_client()
    ensure_consumer_group(client)
    stop = stop_event or threading.Event()

    previous_handlers: dict[int, Any] = {}

    def request_stop(signum: int | None = None, frame: Any = None) -> None:
        del signum, frame
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        if threading.current_thread() is threading.main_thread():
            previous_handlers[sig] = signal.getsignal(sig)
            signal.signal(sig, request_stop)

    try:
        while not stop.is_set():
            batches: Any = client.xreadgroup(
                groupname=GROUP_NAME,
                consumername=CONSUMER_NAME,
                streams={STREAM_NAME: ">"},
                count=10,
                block=2000,
            )
            if not batches:
                continue

            for _stream_batch, messages in batches:
                for message_id, message_data in messages:
                    if stop.is_set():
                        break
                    try:
                        # psycopg context commits successfully completed writes on exit.
                        with get_connection() as conn:
                            process_mention(message_data, conn)
                        client.xack(STREAM_NAME, GROUP_NAME, _decoded_id(message_id))
                    except Exception:
                        logger.exception("Failed to process Redis message %s", _decoded_id(message_id))
    finally:
        if threading.current_thread() is threading.main_thread():
            for sig, handler in previous_handlers.items():
                signal.signal(sig, handler)
