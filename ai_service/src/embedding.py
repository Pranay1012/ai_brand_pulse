"""Vector embeddings module using sentence-transformers (all-MiniLM-L6-v2)."""

import numpy as np
from sentence_transformers import SentenceTransformer

MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

# Lazy-loaded singleton model
_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    """Retrieve or initialize the cached SentenceTransformer model instance."""
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def get_embedding(text: str) -> list[float]:
    """Compute a normalized 384-dimensional dense vector embedding for text.

    Args:
        text: Input string.

    Returns:
        List of 384 Python floats with unit L2 norm (||v|| = 1.0).
    """
    model = get_model()
    # Normalize embeddings ensures unit length, allowing cosine similarity via dot product
    vector: np.ndarray = model.encode(
        text or "",
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return vector.astype(float).tolist()
