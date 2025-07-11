from typing import Dict, List, Any
import httpx
from dbos import DBOS


@DBOS.step()
def search_hackernews_step(query: str, max_results: int = 20) -> List[Dict[str, Any]]:
    """Search Hacker News using Algolia API for stories."""
    url = "https://hn.algolia.com/api/v1/search"
    params = {
        "query": query,
        "hitsPerPage": max_results,
        "tags": "story"
    }
    
    with httpx.Client(timeout=30.0) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.json()["hits"]


@DBOS.step()
def get_story_details_step(story_id: str) -> Dict[str, Any]:
    """Get detailed story information."""
    url = f"https://hn.algolia.com/api/v1/items/{story_id}"
    
    with httpx.Client(timeout=30.0) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.json()


@DBOS.step()
def get_comments_step(story_id: str, max_comments: int = 50) -> List[Dict[str, Any]]:
    """Get comments for a story."""
    url = "https://hn.algolia.com/api/v1/search"
    params = {
        "tags": f"comment,story_{story_id}",
        "hitsPerPage": max_comments
    }
    
    with httpx.Client(timeout=30.0) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.json()["hits"]


@DBOS.step()
def search_comments_step(query: str, max_results: int = 30) -> List[Dict[str, Any]]:
    """Search Hacker News comments using Algolia API."""
    url = "https://hn.algolia.com/api/v1/search"
    params = {
        "query": query,
        "hitsPerPage": max_results,
        "tags": "comment"
    }
    
    with httpx.Client(timeout=30.0) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.json()["hits"]