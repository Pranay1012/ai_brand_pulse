"""Adapters for fetching public brand mentions from third-party APIs."""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
import xml.etree.ElementTree as ET

import httpx
from src.cleaning import clean_html, make_content_hash

HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date"
GOOGLE_NEWS_RSS_URL = "https://news.google.com/rss/search"


def fetch_hacker_news(
    client: httpx.Client,
    keyword: str,
    brand_id: str = "",
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Fetch recent mentions for a keyword from Hacker News Algolia API.

    Args:
        client: HTTPX client instance (allows connection pooling and test mocking).
        keyword: Search term (e.g. "Vercel").
        brand_id: Associated tracked brand UUID.
        limit: Number of hits to retrieve per request (max 100).

    Returns:
        List of normalized mention dictionaries.
    """
    params = {
        "query": keyword,
        "tags": "(story,comment)",
        "hitsPerPage": min(limit, 100),
    }

    response = client.get(HN_SEARCH_URL, params=params, timeout=10.0)
    response.raise_for_status()
    data = response.json()

    mentions: list[dict] = []
    for hit in data.get("hits", []):
        external_id = str(hit.get("objectID", ""))
        if not external_id:
            continue

        # Hacker News comments store text in 'comment_text', stories in 'story_text' or 'title'
        title = (hit.get("title") or hit.get("story_title") or "").strip()
        raw_content = hit.get("comment_text") or hit.get("story_text") or title
        cleaned_content = clean_html(raw_content)

        # Ignore empty posts
        if not cleaned_content:
            continue

        url = hit.get("url") or f"https://news.ycombinator.com/item?id={external_id}"
        author = hit.get("author") or "anonymous"
        published_at = hit.get("created_at") or ""
        content_hash = make_content_hash(brand_id, title, cleaned_content)

        mentions.append({
            "brand_id": brand_id,
            "source": "hacker_news",
            "external_id": external_id,
            "url": url,
            "author": author,
            "title": title,
            "content": cleaned_content,
            "published_at": published_at,
            "content_hash": content_hash,
        })

    return mentions


def fetch_google_news(
    keyword: str,
    brand_id: str = "",
    client: httpx.Client | None = None,
    limit: int = 20,
    timeout: float = 10.0,
) -> list[dict[str, Any]]:
    """Fetch and normalize recent Google News RSS results."""
    try:
        owns_client = client is None
        http_client = client or httpx.Client()
        response = http_client.get(
            GOOGLE_NEWS_RSS_URL,
            params={"q": keyword, "hl": "en-US", "gl": "US", "ceid": "US:en"},
            timeout=timeout,
        )
        response.raise_for_status()
        root = ET.fromstring(response.content)
    except (httpx.HTTPError, ET.ParseError, UnicodeError):
        return []
    finally:
        if "owns_client" in locals() and owns_client:
            http_client.close()

    mentions: list[dict[str, Any]] = []
    for item in root.findall(".//item")[: max(limit, 0)]:
        title = clean_html(item.findtext("title", default=""))
        link = (item.findtext("link", default="") or "").strip()
        guid = (item.findtext("guid", default="") or link).strip()
        raw_description = item.findtext("description", default="") or ""
        content = clean_html(raw_description) or title
        if not title and not content:
            continue

        source_element = item.find("source")
        publisher = source_element.text.strip() if source_element is not None and source_element.text else ""
        published_text = (item.findtext("pubDate", default="") or "").strip()
        published_at = ""
        if published_text:
            try:
                parsed = parsedate_to_datetime(published_text)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                published_at = parsed.isoformat()
            except (TypeError, ValueError, OverflowError):
                published_at = published_text

        mentions.append({
            "brand_id": brand_id,
            "source": "google_news",
            "external_id": guid or make_content_hash(brand_id, title, content),
            "url": link,
            "author": publisher or "Google News",
            "title": title,
            "content": content,
            "published_at": published_at,
            "content_hash": make_content_hash(brand_id, title, content),
        })

    return mentions
