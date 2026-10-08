"""Adapters for fetching public brand mentions from third-party APIs."""

import httpx
from src.cleaning import clean_html, make_content_hash

HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date"


def fetch_hacker_news(
    client: httpx.Client,
    keyword: str,
    brand_id: str = "",
    limit: int = 20,
) -> list[dict]:
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
