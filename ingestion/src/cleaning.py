"""Data normalization and hashing utilities for ingested mentions."""

import hashlib
import re
from bs4 import BeautifulSoup

# Maximum character length allowed for mention content
MAX_CONTENT_LENGTH = 4000


def clean_html(raw_html: str | None) -> str:
    """Strip HTML tags, unescape HTML entities, and normalize whitespace.

    Args:
        raw_html: Raw HTML string or None.

    Returns:
        Clean, normalized plain text truncated to MAX_CONTENT_LENGTH.
    """
    if not raw_html:
        return ""

    # 1. Parse HTML and extract textual content with spaces between blocks
    soup = BeautifulSoup(raw_html, "html.parser")
    text = soup.get_text(separator=" ")

    # 2. Collapse consecutive whitespace characters into a single space
    cleaned_text = re.sub(r"\s+", " ", text).strip()

    # 3. Truncate to maximum allowed length
    return cleaned_text[:MAX_CONTENT_LENGTH]


def make_content_hash(brand_id: str, title: str, content: str) -> str:
    """Generate a deterministic SHA-256 hash for a brand mention.

    Normalization applied before hashing:
    - Lowercase title and content.
    - Stripped leading/trailing whitespace.
    - Combined as brand_id:title:content.

    Args:
        brand_id: UUID of the tracked brand.
        title: Title of the post or article.
        content: Cleaned text content of the post or comment.

    Returns:
        64-character lowercase SHA-256 hexadecimal string.
    """
    norm_title = (title or "").strip().lower()
    norm_content = (content or "").strip().lower()

    payload = f"{brand_id}:{norm_title}:{norm_content}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
