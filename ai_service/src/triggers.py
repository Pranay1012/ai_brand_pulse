from typing import Any

MIN_MENTION_COUNT = 5
MIN_NEGATIVE_RATIO = 0.6


def evaluate_trigger(cluster: dict[str, Any]) -> bool:
    """Return whether a cluster meets the Phase 6 action threshold."""
    mention_count = int(cluster.get("mention_count", 0) or 0)
    negative_count = int(cluster.get("negative_count", 0) or 0)
    if mention_count < MIN_MENTION_COUNT:
        return False
    return negative_count / mention_count >= MIN_NEGATIVE_RATIO
