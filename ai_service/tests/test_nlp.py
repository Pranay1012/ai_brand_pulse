import math
import numpy as np
import pytest

from src.sentiment import analyze_sentiment
from src.embedding import get_embedding, EMBEDDING_DIM


# ---------------------------------------------------------------------------
# Sentiment Analysis Tests
# ---------------------------------------------------------------------------

def test_analyze_sentiment_negative():
    text = "Vercel deploys are constantly failing with 504 errors, this is terrible and completely broken!"
    score, label = analyze_sentiment(text)
    assert label == "negative"
    assert score <= -0.05


def test_analyze_sentiment_positive():
    text = "Vercel is absolutely fantastic! Deployments are lightning fast and the developer experience is wonderful."
    score, label = analyze_sentiment(text)
    assert label == "positive"
    assert score >= 0.05


def test_analyze_sentiment_neutral():
    text = "The package was updated to version 15.0 on Tuesday."
    score, label = analyze_sentiment(text)
    assert label == "neutral"
    assert -0.05 < score < 0.05


def test_analyze_sentiment_empty_or_none():
    score, label = analyze_sentiment(None)
    assert score == 0.0
    assert label == "neutral"

    score, label = analyze_sentiment("   ")
    assert score == 0.0
    assert label == "neutral"


# ---------------------------------------------------------------------------
# Embedding Tests
# ---------------------------------------------------------------------------

def test_get_embedding_dimension_and_norm():
    text = "504 gateway timeout error during Next.js deploy"
    emb = get_embedding(text)

    # Must be exactly 384 dimensions matching vector(384) in PostgreSQL schema
    assert len(emb) == EMBEDDING_DIM
    assert isinstance(emb, list)
    assert all(isinstance(x, float) for x in emb)

    # Must be a normalized unit vector (L2 norm ≈ 1.0)
    norm = float(np.linalg.norm(emb))
    assert math.isclose(norm, 1.0, rel_tol=1e-3)


def test_get_embedding_semantic_similarity():
    query_a = "Vercel build failed with 504 gateway timeout"
    query_b = "Deployment error 504 server timeout on Vercel"
    unrelated = "Baking chocolate chip cookies in the kitchen"

    emb_a = np.array(get_embedding(query_a))
    emb_b = np.array(get_embedding(query_b))
    emb_u = np.array(get_embedding(unrelated))

    # For unit vectors, dot product equals cosine similarity
    sim_similar = float(np.dot(emb_a, emb_b))
    sim_unrelated = float(np.dot(emb_a, emb_u))

    # Semantically similar texts must have high similarity (typically > 0.75)
    assert sim_similar > 0.70

    # Unrelated texts must have much lower similarity
    assert sim_unrelated < 0.35

    assert sim_similar > sim_unrelated
