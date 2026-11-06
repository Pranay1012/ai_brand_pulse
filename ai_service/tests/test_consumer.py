from unittest.mock import MagicMock

from redis.exceptions import ResponseError

from src import consumer


def test_ensure_consumer_group_creates_stream_and_group(mocker):
    client = MagicMock()

    consumer.ensure_consumer_group(client)

    client.xgroup_create.assert_called_once_with(
        "bp:mentions", "ai-engine", id="$", mkstream=True
    )


def test_ensure_consumer_group_ignores_existing_group(mocker):
    client = MagicMock()
    client.xgroup_create.side_effect = ResponseError("BUSYGROUP Consumer Group name already exists")

    consumer.ensure_consumer_group(client)


def test_process_mention_updates_matching_cluster(mocker):
    conn = MagicMock()
    mocker.patch("src.consumer.analyze_sentiment", return_value=(-0.8, "negative"))
    mocker.patch("src.consumer.generate_embedding", return_value=[0.1, 0.2])
    mocker.patch("src.consumer.find_nearest_cluster", return_value={"id": "cluster-existing"})
    update = mocker.patch("src.consumer.update_cluster_centroid")
    create = mocker.patch("src.consumer.create_cluster")
    mocker.patch("src.consumer.save_mention", return_value="mention-existing")

    result = consumer.process_mention(
        {
            "brand_id": "brand-1",
            "content": "Deployment is constantly failing",
            "source": "hacker_news",
            "external_id": "123",
            "url": "https://news.example.com/123",
            "author": "tester",
            "title": "Deployment failure",
            "content_hash": "hash-1",
            "published_at": "2026-10-28T10:00:00Z",
        },
        conn,
    )

    update.assert_called_once_with(conn, "cluster-existing", [0.1, 0.2], -0.8)
    create.assert_not_called()
    assert result["cluster_id"] == "cluster-existing"
    assert result["mention_id"] == "mention-existing"
    assert result["action"] == "cluster_updated"


def test_process_mention_creates_cluster_when_no_match(mocker):
    conn = MagicMock()
    mocker.patch("src.consumer.analyze_sentiment", return_value=(-0.7, "negative"))
    mocker.patch("src.consumer.generate_embedding", return_value=[0.3, 0.4])
    mocker.patch("src.consumer.find_nearest_cluster", return_value=None)
    update = mocker.patch("src.consumer.update_cluster_centroid")
    create = mocker.patch("src.consumer.create_cluster", return_value="cluster-new")
    save = mocker.patch("src.consumer.save_mention", return_value="mention-new")

    result = consumer.process_mention(
        {
            "brand_id": "brand-1",
            "text": "Build errors keep happening on every deployment",
            "source": "hacker_news",
            "content_hash": "hash-2",
            "published_at": "2026-10-28T11:00:00Z",
        },
        conn,
    )

    update.assert_not_called()
    create.assert_called_once_with(
        conn,
        "brand-1",
        "Build errors keep happening on every deployment",
        [0.3, 0.4],
        "negative",
    )
    assert save.call_args.args[2] == "cluster-new"
    assert result["cluster_id"] == "cluster-new"
    assert result["action"] == "cluster_created"


def test_start_consumer_reads_batch_processes_and_acknowledges(mocker):
    import threading

    stop = threading.Event()
    redis_client = MagicMock()
    redis_client.xreadgroup.side_effect = [
        [("bp:mentions", [(b"123-0", {b"payload": b'{"brand_id":"brand-1","content":"Build failed"}'})])],
        [],
    ]
    xread_call_count = 0

    def read_after_first_batch(*_args, **_kwargs):
        nonlocal xread_call_count
        xread_call_count += 1
        if xread_call_count == 1:
            return [
                ("bp:mentions", [(b"123-0", {b"payload": '{"brand_id":"brand-1","content":"Build failed"}'})])
            ]
        stop.set()
        return []

    redis_client.xreadgroup.side_effect = read_after_first_batch
    conn = MagicMock()
    mocker.patch("src.consumer.ensure_consumer_group")
    get_connection = mocker.patch("src.consumer.get_connection")
    connection_context = get_connection.return_value
    connection_context.__enter__.return_value = conn
    process = mocker.patch("src.consumer.process_mention")

    consumer.start_consumer(redis_client, stop_event=stop)

    process.assert_called_once()
    redis_client.xack.assert_called_once_with("bp:mentions", "ai-engine", "123-0")


def test_threshold_crossing_mention_creates_pending_action(mocker):
    conn = MagicMock()
    mocker.patch("src.consumer.analyze_sentiment", return_value=(-0.9, "negative"))
    mocker.patch("src.consumer.generate_embedding", return_value=[0.1, 0.2])
    mocker.patch("src.consumer.find_nearest_cluster", return_value={"id": "cluster-1"})
    mocker.patch("src.consumer.update_cluster_centroid")
    mocker.patch("src.consumer.save_mention", return_value="mention-5")
    mocker.patch(
        "src.consumer.get_cluster",
        return_value={
            "id": "cluster-1",
            "brand_id": "brand-1",
            "title": "Deployment failures",
            "mention_count": 5,
            "negative_count": 3,
        },
    )
    mocker.patch("src.consumer.has_active_action", return_value=False)
    mocker.patch(
        "src.consumer.get_cluster_mentions",
        return_value=[{"content": "504 timeout during deployment"}],
    )
    mocker.patch(
        "src.consumer.synthesize_action",
        return_value={"summary": "Deployment failures", "description": "504 errors"},
    )
    save_action = mocker.patch("src.consumer.save_action", return_value="action-1")

    result = consumer.process_mention(
        {"brand_id": "brand-1", "content": "Another deployment is failing"},
        conn,
    )

    save_action.assert_called_once()
    assert result["action_id"] == "action-1"
    assert result["action"] == "action_created"
