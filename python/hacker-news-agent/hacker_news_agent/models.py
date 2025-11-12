from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

AGENT_STATUS = "agent_status"


class AgentStartRequest(BaseModel):
    topic: str


class AgentStatus(BaseModel):
    agent_id: str
    created_at: str
    topic: str
    iterations: int
    report: Optional[str]
    status: str


class StoryReference(BaseModel):
    title: str
    url: str
    hn_url: str
    points: int
    num_comments: int
    author: str
    objectID: str


class EvaluationResult(BaseModel):
    insights: List[str] = Field(
        description="Array of specific, technical insights with context"
    )
    relevance_score: int = Field(ge=1, le=10, description="Relevance score from 1-10")
    summary: str = Field(description="Brief summary of findings")
    key_points: List[str] = Field(
        description="Array of most important points discovered"
    )
    query: str = Field(description="The query that was used for this evaluation")
    top_stories: List[StoryReference] = Field(
        description="List of top stories analyzed"
    )
