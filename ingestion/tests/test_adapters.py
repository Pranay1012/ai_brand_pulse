import httpx
import pytest
from src.adapters import fetch_hacker_news


def test_fetch_hacker_news_parses_response_correctly():
    fake_response = {
        "hits": [
            {
                "objectID": "12345678",
                "author": "dev_dan",
                "story_title": "Why Vercel is having 504 errors",
                "comment_text": "<p>I had <b>three</b> deployment errors today with 504 gateway timeout.</p>",
                "created_at": "2026-10-04T12:00:00Z",
                "url": None,
            },
            {
                "objectID": "87654321",
                "author": "tech_lead",
                "title": "Vercel outage report",
                "story_text": "<p>Full post mortem available.</p>",
                "created_at": "2026-10-04T13:00:00Z",
                "url": "https://example.com/postmortem",
            },
        ]
    }

    def mock_handler(request: httpx.Request):
        assert "query=vercel" in str(request.url)
        return httpx.Response(200, json=fake_response)

    transport = httpx.MockTransport(mock_handler)
    with httpx.Client(transport=transport) as client:
        brand_id = "33333333-3333-3333-3333-333333333333"
        mentions = fetch_hacker_news(client, keyword="vercel", brand_id=brand_id)

    assert len(mentions) == 2

    # Check first mention (comment)
    m1 = mentions[0]
    assert m1["brand_id"] == brand_id
    assert m1["source"] == "hacker_news"
    assert m1["external_id"] == "12345678"
    assert m1["url"] == "https://news.ycombinator.com/item?id=12345678"
    assert m1["author"] == "dev_dan"
    assert m1["title"] == "Why Vercel is having 504 errors"
    assert m1["content"] == "I had three deployment errors today with 504 gateway timeout."
    assert len(m1["content_hash"]) == 64

    # Check second mention (story with external url)
    m2 = mentions[1]
    assert m2["external_id"] == "87654321"
    assert m2["url"] == "https://example.com/postmortem"
    assert m2["author"] == "tech_lead"
    assert m2["title"] == "Vercel outage report"
    assert m2["content"] == "Full post mortem available."


def test_fetch_hacker_news_handles_empty_response():
    def mock_handler(request: httpx.Request):
        return httpx.Response(200, json={"hits": []})

    transport = httpx.MockTransport(mock_handler)
    with httpx.Client(transport=transport) as client:
        mentions = fetch_hacker_news(client, keyword="nonexistentbrand")

    assert mentions == []
