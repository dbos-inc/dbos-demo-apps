import html
import os
import re
from datetime import UTC, datetime, timedelta

import requests
import slack_sdk

from dbos import DBOS

dbos = DBOS()


@dbos.communicator()
def search_hackernews(query: str, window_size_hours: int):

    threshold = datetime.now(UTC) - timedelta(hours=window_size_hours)

    params = {
        "tags": "comment",
        "query": query,
        "numericFilters": f"created_at_i>{threshold.timestamp()}",
    }

    response = requests.get("http://hn.algolia.com/api/v1/search", params).json()

    hits = []
    for hit in response["hits"]:
        comment = hit["comment_text"]
        comment = re.sub("<p>", "\n", html.unescape(comment))
        comment = re.sub("<[^<]+?>", "", comment)
        url = f"https://news.ycombinator.com/item?id={hit['objectID']}"
        hits.append((comment, url))
    return hits


@dbos.communicator()
def post_to_slack(comment: str, url: str):
    message = f"""
    {comment}

    {url}
    """
    client = slack_sdk.WebClient(token=os.environ["SLACK_HN_BOT_OAUTH_TOKEN"])
    client.chat_postMessage(
        channel="hacker-news-alerts",
        text=message,
        unfurl_links=False,
        unfurl_media=False,
    )


@dbos.scheduled("0 * * * *")
def run_hourly(scheduled_time: datetime, actual_time: datetime):
    results = search_hackernews("serverless", window_size_hours=1)
    for comment, url in results:
        post_to_slack(comment, url)
    DBOS.logger.info(f"Found {len(results)} comments at {str(actual_time)}")
