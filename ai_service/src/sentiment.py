"""Sentiment analysis utility using VADER."""

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Initialize analyzer once (singleton)
_analyzer = SentimentIntensityAnalyzer()


def analyze_sentiment(text: str | None) -> tuple[float, str]:
    """Calculate sentiment score and classification label using VADER.

    Classification thresholds based on VADER standard recommendations:
    - Compound score <= -0.05: 'negative'
    - Compound score >=  0.05: 'positive'
    - Otherwise: 'neutral'

    Args:
        text: Input string to evaluate.

    Returns:
        tuple of (compound_score: float, label: str), where
        compound_score is in [-1.0, 1.0] and label is 'negative', 'neutral', or 'positive'.
    """
    if not text or not text.strip():
        return 0.0, "neutral"

    scores = _analyzer.polarity_scores(text)
    compound = float(scores.get("compound", 0.0))

    if compound <= -0.05:
        label = "negative"
    elif compound >= 0.05:
        label = "positive"
    else:
        label = "neutral"

    return compound, label
