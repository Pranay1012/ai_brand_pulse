from src.llm import synthesize_action


def test_mock_synthesis_returns_structured_jira_ticket(mocker):
    mocker.patch.dict("os.environ", {"LLM_PROVIDER": "mock"}, clear=False)

    result = synthesize_action(
        "Deployment failures",
        [{"title": "504 gateway timeout", "content": "Deployment failed"}],
    )

    assert "summary" in result
    assert "description" in result
    assert "priority" in result
    assert isinstance(result["steps_to_reproduce"], list)
    assert isinstance(result["acceptance_criteria"], list)


def test_mock_provider_is_deterministic(mocker):
    mocker.patch.dict("os.environ", {"LLM_PROVIDER": "mock"}, clear=False)
    mentions = [{"title": "Build failure"}]

    assert synthesize_action("Build failures", mentions) == synthesize_action("Build failures", mentions)
