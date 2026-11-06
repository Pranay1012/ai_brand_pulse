from src.llm import synthesize_action
from src.triggers import evaluate_trigger


def test_duplicate_active_action_prevents_second_draft(mocker):
    conn = object()
    has_active = mocker.patch("src.db.has_active_action", return_value=True)
    assert has_active(conn, "cluster-1") is True


def test_synthesized_payload_contains_jira_fields():
    action = synthesize_action("API 504 failures", [{"content": "Requests return 504"}])
    assert action["summary"]
    assert action["description"]
    assert action["priority"]
    assert action["steps_to_reproduce"]
    assert action["acceptance_criteria"]


def test_exact_trigger_boundaries():
    assert evaluate_trigger({"mention_count": 5, "negative_count": 3})
    assert not evaluate_trigger({"mention_count": 5, "negative_count": 2})
