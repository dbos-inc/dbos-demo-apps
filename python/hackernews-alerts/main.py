# Hacker News Slackbot

# In this example, we use DBOS to deploy a cron job that periodically searches Hacker News
# for new posts about serverless computing and posts them to a Slack channel.

# First, let's do imports and create a DBOS app.

import html
import os
import re
from datetime import UTC, datetime, timedelta

import requests
import slack_sdk

from dbos import DBOS

dbos = DBOS()


# Then, let's write a function that searches Hacker News.
# This function uses Algolia's Hacker News Search API to find all comments
# in the last N hours containing a search term.
# It returns matching comments and links to them.


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
        # Reformat the comment by unescaping HTML, adding newlines, and removing HTML tags
        comment = hit["comment_text"]
        comment = re.sub("<p>", "\n", html.unescape(comment))
        comment = re.sub("<[^<]+?>", "", comment)
        url = f"https://news.ycombinator.com/item?id={hit['objectID']}"
        hits.append((comment, url))
    return hits


# Next, let's write a function that posts a Hacker News comment and its URL to Slack.

# This function requires a Slack bot token.
# Follow this tutorial to generate one: https://api.slack.com/tutorials/tracks/getting-a-token
# Your token should start with "xoxb". Set it as an environment variable like so:
# export SLACK_HN_BOT_OAUTH_TOKEN=your_token


@dbos.communicator()
def post_to_slack(comment: str, url: str):
    message = f"{comment}\n\n{url}"
    client = slack_sdk.WebClient(token=os.environ["SLACK_HN_BOT_OAUTH_TOKEN"])
    client.chat_postMessage(
        channel="hacker-news-alerts",
        text=message,
        unfurl_links=False,
        unfurl_media=False,
    )


# Finally, let's write a cron job that runs the search every hour.
# The @dbos.scheduled() decorator tells DBOS to run this function on a cron schedule.
# For more information on cron syntax, see: https://docs.gitlab.com/ee/topics/cron/


@dbos.scheduled("0 * * * *")
@dbos.workflow()
def run_hourly(scheduled_time: datetime, actual_time: datetime):
    results = search_hackernews("serverless", window_size_hours=1)
    for comment, url in results:
        post_to_slack(comment, url)
    DBOS.logger.info(f"Found {len(results)} comments at {str(actual_time)}")


# To deploy this app to the cloud as a persistent cron job, run `dbos-cloud app deploy`
