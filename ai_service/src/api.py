import logging
import os
import threading
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.consumer import get_redis_client, start_consumer
from src.db import get_connection
from src.embedding import generate_embedding
from src.sentiment import analyze_sentiment

logger = logging.getLogger(__name__)


class TextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=1)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must not be blank")
        return value


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    stop_event = threading.Event()
    worker: threading.Thread | None = None

    if os.getenv("ENABLE_CONSUMER", "false").lower() in {"1", "true", "yes", "on"}:
        worker = threading.Thread(
            target=start_consumer,
            kwargs={"stop_event": stop_event},
            name="ai-redis-consumer",
            daemon=True,
        )
        worker.start()
        logger.info("Redis consumer background worker started")

    try:
        yield
    finally:
        stop_event.set()
        if worker is not None and worker.is_alive():
            worker.join(timeout=3)


app = FastAPI(title="BrandPulse AI Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    db_status = "disconnected"
    redis_status = "disconnected"
    db_error = None
    redis_error = None

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        db_status = "connected"
    except Exception as exc:
        db_error = str(exc)

    redis_client = None
    try:
        redis_client = get_redis_client()
        redis_client.ping()
        redis_status = "connected"
    except Exception as exc:
        redis_error = str(exc)
    finally:
        if redis_client is not None:
            close = getattr(redis_client, "close", None)
            if callable(close):
                close()

    overall = "ok" if db_status == "connected" and redis_status == "connected" else "degraded"
    response = {
        "status": overall,
        "db": db_status,
        "redis": redis_status,
        "model": "all-MiniLM-L6-v2",
    }
    if db_error:
        response["db_error"] = db_error
    if redis_error:
        response["redis_error"] = redis_error
    return response


@app.post("/embed")
def embed(request: TextRequest) -> dict[str, object]:
    embedding = generate_embedding(request.text)
    return {
        "embedding": embedding,
        "dimensions": len(embedding),
    }


@app.post("/sentiment")
def sentiment(request: TextRequest) -> dict[str, object]:
    score, label = analyze_sentiment(request.text)
    return {
        "score": score,
        "label": label,
    }
