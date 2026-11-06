from src.triggers import evaluate_trigger


def test_trigger_is_true_at_volume_and_negative_ratio_threshold():
    assert evaluate_trigger({"mention_count": 5, "negative_count": 3}) is True
    assert evaluate_trigger({"mention_count": 10, "negative_count": 6}) is True


def test_trigger_is_false_below_volume_or_negative_ratio():
    assert evaluate_trigger({"mention_count": 4, "negative_count": 4}) is False
    assert evaluate_trigger({"mention_count": 10, "negative_count": 5}) is False


def test_trigger_handles_missing_or_zero_counts():
    assert evaluate_trigger({}) is False
    assert evaluate_trigger({"mention_count": 0, "negative_count": 0}) is False
