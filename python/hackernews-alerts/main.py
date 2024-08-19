import html
from datetime import UTC, datetime, timedelta

import requests

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
        comment = html.unescape(hit["comment_text"])
        url = f"https://news.ycombinator.com/item?id={hit['objectID']}"
        hits.append((comment, url))
    return hits


if __name__ == "__main__":
    results = search_hackernews("serverless", 24)
    for comment, url in results:
        print(comment)
        print(url)
    dbos.destroy()
