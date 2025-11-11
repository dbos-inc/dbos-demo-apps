from typing import Literal, Optional

from pydantic import BaseModel

AGENT_STATUS = "agent_status"


class AgentStartRequest(BaseModel):
    topic: str


class AgentStatus(BaseModel):
    agent_id: str
    created_at: str
    topic: str
    iterations: int
    report: Optional[str]
    status: Literal["PENDING", "SUCCESS", "ERROR"]
