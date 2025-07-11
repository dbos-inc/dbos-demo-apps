from typing import Any, Dict, List

import httpx
from dbos import DBOS

# Algolia API configuration
HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
API_TIMEOUT = 30.0


@DBOS.step()
def search_hackernews_step(query: str, max_results: int = 20) -> List[Dict[str, Any]]:
    """Search Hacker News stories using Algolia API.

    Args:
        query: Search query string
        max_results: Maximum number of results to return

    Returns:
        List of story dictionaries with metadata
    """
    params = {"query": query, "hitsPerPage": max_results, "tags": "story"}

    with httpx.Client(timeout=API_TIMEOUT) as client:
        response = client.get(HN_SEARCH_URL, params=params)
        response.raise_for_status()
        return response.json()["hits"]


@DBOS.step()
def get_comments_step(story_id: str, max_comments: int = 50) -> List[Dict[str, Any]]:
    """Get comments for a specific Hacker News story.

    Args:
        story_id: The Hacker News story ID
        max_comments: Maximum number of comments to return

    Returns:
        List of comment dictionaries
    """
    params = {"tags": f"comment,story_{story_id}", "hitsPerPage": max_comments}

    with httpx.Client(timeout=API_TIMEOUT) as client:
        response = client.get(HN_SEARCH_URL, params=params)
        response.raise_for_status()
        return response.json()["hits"]
