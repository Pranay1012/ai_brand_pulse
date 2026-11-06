import httpx
from src.adapters import fetch_google_news, fetch_hacker_news


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
    def mock_handler(_request: httpx.Request):
        return httpx.Response(200, json={"hits": []})

    transport = httpx.MockTransport(mock_handler)
    with httpx.Client(transport=transport) as client:
        mentions = fetch_hacker_news(client, keyword="nonexistentbrand")

    assert mentions == []


def test_fetch_google_news_parses_rss_xml():
    rss = b"""<?xml version='1.0' encoding='UTF-8'?>
    <rss version='2.0'><channel>
      <item>
        <title>Vercel outage - Tech News</title>
        <link>https://news.google.com/articles/example1</link>
        <guid>google-news-guid-1</guid>
        <pubDate>Tue, 04 Nov 2026 12:00:00 GMT</pubDate>
        <description>&lt;p&gt;Multiple deployments are failing.&lt;/p&gt;</description>
        <source>Tech News</source>
      </item>
    </channel></rss>"""

    def mock_handler(request: httpx.Request):
        assert "news.google.com" in str(request.url)
        assert "q=vercel" in str(request.url).lower()
        return httpx.Response(200, content=rss, headers={"Content-Type": "application/rss+xml"})

    with httpx.Client(transport=httpx.MockTransport(mock_handler)) as client:
        mentions = fetch_google_news("vercel", "33333333-3333-3333-3333-333333333333", client=client)

    assert len(mentions) == 1
    assert mentions[0]["source"] == "google_news"
    assert mentions[0]["title"] == "Vercel outage - Tech News"
    assert mentions[0]["content"] == "Multiple deployments are failing."
    assert mentions[0]["external_id"] == "google-news-guid-1"
    assert mentions[0]["url"] == "https://news.google.com/articles/example1"
    assert mentions[0]["author"] == "Tech News"
    assert len(mentions[0]["content_hash"]) == 64


def test_fetch_google_news_empty_feed():
    rss = b"<rss version='2.0'><channel><title>News</title></channel></rss>"

    def mock_handler(_request: httpx.Request):
        return httpx.Response(200, content=rss)

    with httpx.Client(transport=httpx.MockTransport(mock_handler)) as client:
        mentions = fetch_google_news("no-results", "brand-1", client=client)

    assert mentions == []


def test_fetch_google_news_malformed_xml_and_http_error():
    def malformed_handler(_request: httpx.Request):
        return httpx.Response(200, content=b"<rss><channel>")

    with httpx.Client(transport=httpx.MockTransport(malformed_handler)) as client:
        assert fetch_google_news("vercel", "brand-1", client=client) == []

    def error_handler(_request: httpx.Request):
        return httpx.Response(503)

    with httpx.Client(transport=httpx.MockTransport(error_handler)) as client:
        assert fetch_google_news("vercel", "brand-1", client=client) == []
