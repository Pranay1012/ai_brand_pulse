import pytest
from src.cleaning import clean_html, make_content_hash, MAX_CONTENT_LENGTH


def test_clean_html_strips_tags():
    raw = "<p>Vercel deploys are <b>failing</b> with <i>504</i> timeouts!</p>"
    cleaned = clean_html(raw)
    assert cleaned == "Vercel deploys are failing with 504 timeouts!"


def test_clean_html_unescapes_entities():
    raw = "Deploying on Vercel &amp; Next.js: It&#39;s &quot;fast&quot;"
    cleaned = clean_html(raw)
    assert cleaned == "Deploying on Vercel & Next.js: It's \"fast\""


def test_clean_html_collapses_whitespace():
    raw = "<p>Line 1</p>\n\n\t  <p>Line   2\twith\nspaces</p>"
    cleaned = clean_html(raw)
    assert cleaned == "Line 1 Line 2 with spaces"


def test_clean_html_none_or_empty():
    assert clean_html(None) == ""
    assert clean_html("") == ""
    assert clean_html("   ") == ""


def test_clean_html_truncates_long_text():
    long_content = "a" * 5000
    cleaned = clean_html(f"<p>{long_content}</p>")
    assert len(cleaned) == MAX_CONTENT_LENGTH


def test_make_content_hash_deterministic():
    brand_id = "33333333-3333-3333-3333-333333333333"
    h1 = make_content_hash(brand_id, "Deploy failed", "504 error during build")
    h2 = make_content_hash(brand_id, "Deploy failed", "504 error during build")
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 is 64 hex characters


def test_make_content_hash_case_and_whitespace_normalized():
    brand_id = "33333333-3333-3333-3333-333333333333"
    h1 = make_content_hash(brand_id, "Deploy Failed", "504 Error During Build")
    h2 = make_content_hash(brand_id, "  deploy failed  ", " 504 error during build\n")
    assert h1 == h2


def test_make_content_hash_different_inputs_produce_different_hashes():
    brand_id = "33333333-3333-3333-3333-333333333333"
    h1 = make_content_hash(brand_id, "Title A", "Same content")
    h2 = make_content_hash(brand_id, "Title B", "Same content")
    assert h1 != h2
