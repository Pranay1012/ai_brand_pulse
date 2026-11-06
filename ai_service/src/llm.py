import json
import os
import urllib.request
from typing import Any


def _mock_ticket(cluster_title: str, mentions: list[dict[str, Any]]) -> dict[str, Any]:
    summary = f"Investigate recurring issue: {cluster_title or 'BrandPulse incident'}"
    evidence = "\n".join(
        f"- {mention.get('title') or mention.get('content', '')}".strip()
        for mention in (mentions or [])[:5]
    )
    description = (
        f"Multiple users reported the issue '{cluster_title}'.\n\n"
        "Recent evidence:\n"
        f"{evidence or '- No recent mention text available.'}"
    )
    return {
        "summary": summary[:255],
        "description": description,
        "priority": "High",
        "steps_to_reproduce": [
            "Reproduce the user-reported workflow described in the cluster.",
            "Observe the failure and collect relevant logs or screenshots.",
        ],
        "acceptance_criteria": [
            "The reported failure is resolved for the affected workflow.",
            "The fix prevents recurrence and includes regression coverage.",
        ],
    }


def _ollama_ticket(cluster_title: str, mentions: list[dict[str, Any]]) -> dict[str, Any]:
    url = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
    model = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
    prompt = (
        "Create a structured Jira bug ticket as valid JSON for this cluster. "
        "Use exactly these fields: summary, description, priority, "
        "steps_to_reproduce, acceptance_criteria.\n"
        f"Cluster: {cluster_title}\n"
        f"Recent mentions: {json.dumps(mentions, ensure_ascii=False, default=str)}\n"
        "Return JSON only."
    )
    request = urllib.request.Request(
        url,
        data=json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "60"))) as response:
        result = json.loads(response.read().decode("utf-8"))

    content = result.get("response", "")
    try:
        ticket = json.loads(content)
    except json.JSONDecodeError:
        ticket = _mock_ticket(cluster_title, mentions)

    required = {"summary", "description", "priority", "steps_to_reproduce", "acceptance_criteria"}
    if not required.issubset(ticket):
        ticket = _mock_ticket(cluster_title, mentions)
    return ticket


def synthesize_action(cluster_title: str, mentions: list[dict[str, Any]]) -> dict[str, Any]:
    """Synthesize a structured Jira ticket using the configured provider."""
    provider = os.getenv("LLM_PROVIDER", "mock").lower()
    if provider == "ollama":
        try:
            return _ollama_ticket(cluster_title, mentions)
        except Exception:
            return _mock_ticket(cluster_title, mentions)
    return _mock_ticket(cluster_title, mentions)
