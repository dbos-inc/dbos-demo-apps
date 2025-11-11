from pydantic import BaseModel


class AgentStartRequest(BaseModel):
    topic: str


class AgentStatus(BaseModel):
    agent_id: str
    created_at: str
    topic: str
    completed_iterations: str
    report: str
