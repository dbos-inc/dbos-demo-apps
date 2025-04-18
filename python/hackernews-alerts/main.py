# Hacker News Slackbot

# This app uses DBOS to deploy a scheduled job that periodically searches Hacker News
# for people commenting about serverless computing and posts the comments to Slack.

# First, let's do imports and initialize DBOS.

import html
import os
import re
import threading
from datetime import UTC, datetime, timedelta

import requests
import slack_sdk
from dbos import DBOS, DBOSConfig

config: DBOSConfig = {
    "name": "hackernews-alerts",
}
DBOS(config=config)


# Then, let's write a function that searches Hacker News.
# This function uses Algolia's Hacker News Search API to find all comments
# in the last N hours containing a search term.
# It returns matching comments and links to them.

# We annotate this function with `@DBOS.step` so we can call it from
# a durable workflow later on.


@DBOS.step()
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

# We annotate this function with `@DBOS.step` so we can call it from
# a durable workflow later on.


@DBOS.step()
def post_to_slack(comment: str, url: str):
    message = f"{comment}\n\n{url}"
    client = slack_sdk.WebClient(token=os.environ["SLACK_HN_BOT_OAUTH_TOKEN"])
    client.chat_postMessage(
        channel="hacker-news-alerts",
        text=message,
        unfurl_links=False,
        unfurl_media=False,
    )


# Now, let's write a scheduled job that runs the search every hour.

# The @DBOS.scheduled decorator tells DBOS to run this function on a schedule.
# defined with crontab syntax, in this case once per hour. For more information
# on crontab syntax, see: https://docs.gitlab.com/ee/topics/cron/

# The @DBOS.workflow decorator tells DBOS to durably execute this search, so it
# runs exactly-once per hour and you'll never miss a comment or record a duplicate.


@DBOS.scheduled("0 * * * *")
@DBOS.workflow()
def run_hourly(scheduled_time: datetime, actual_time: datetime):
    results = search_hackernews("serverless", window_size_hours=1)
    for comment, url in results:
        post_to_slack(comment, url)
    DBOS.logger.info(f"Found {len(results)} comments at {str(actual_time)}")


# Finally, in our main function, let's launch DBOS, then sleep the main thread forever
# while the background threads run.

if __name__ == "__main__":
    DBOS.launch()
    threading.Event().wait()


# To deploy this app to the cloud as a persistent cron job, run `dbos-cloud app deploy`
