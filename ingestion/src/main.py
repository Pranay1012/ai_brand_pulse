"""Ingestion worker: polls public feeds, deduplicates in Redis, and publishes to streams."""

import argparse
import logging
import os
import sys
from pathlib import Path
import time

# Ensure the ingestion directory is on sys.path when executed directly as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
import httpx
import redis

from src.adapters import fetch_hacker_news
from src.db import get_active_brands
from src.publisher import is_new_mention, publish_mention

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("ingestion")


def run_ingestion_cycle(
    database_url: str,
    redis_client: redis.Redis,
    http_client: httpx.Client,
) -> tuple[int, int]:
    """Execute one full ingestion cycle across all active brands.

    Returns:
        tuple of (new_published_count, duplicate_skipped_count).
    """
    brands = get_active_brands(database_url)
    logger.info("Found %d active brand(s) to track", len(brands))

    new_count = 0
    dup_count = 0

    for brand in brands:
        brand_id = brand["id"]
        brand_name = brand["name"]
        keywords = brand.get("keywords") or [brand_name]

        logger.info("Polling mentions for '%s' (keywords: %s)", brand_name, keywords)

        for keyword in keywords:
            try:
                mentions = fetch_hacker_news(
                    client=http_client,
                    keyword=keyword,
                    brand_id=brand_id,
                )
            except Exception as e:
                logger.error("Failed fetching for keyword '%s': %s", keyword, e)
                continue

            for mention in mentions:
                content_hash = mention["content_hash"]
                if is_new_mention(redis_client, brand_id, content_hash):
                    entry_id = publish_mention(redis_client, mention)
                    logger.info(
                        "Published new mention [%s] title: '%.40s' -> ID: %s",
                        brand_name,
                        mention["title"] or mention["content"],
                        entry_id,
                    )
                    new_count += 1
                else:
                    dup_count += 1

    logger.info(
        "Cycle complete: published %d new mention(s), skipped %d duplicate(s)",
        new_count,
        dup_count,
    )
    return new_count, dup_count


def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description="BrandPulse Ingestion Worker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single ingestion cycle and exit",
    )
    args = parser.parse_args()

    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/brandpulse",
    )
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    interval = int(os.getenv("INGEST_INTERVAL_SECONDS", "300"))

    logger.info("Connecting to Redis at %s", redis_url)
    redis_client = redis.from_url(redis_url, decode_responses=False)

    with httpx.Client() as http_client:
        if args.once:
            logger.info("Running single cycle mode (--once)")
            run_ingestion_cycle(database_url, redis_client, http_client)
            return

        logger.info("Starting ingestion loop (interval: %d seconds)", interval)
        while True:
            try:
                run_ingestion_cycle(database_url, redis_client, http_client)
            except Exception as e:
                logger.error("Error during ingestion cycle: %s", e)

            time.sleep(interval)


if __name__ == "__main__":
    main()
