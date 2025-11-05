import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Literal, Optional
from datetime import datetime
from uuid import uuid4
from dbos import DBOS, DBOSConfig
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AGENT_STATUS = "agent_status"

class AgentStartRequest(BaseModel):
    name: str
    task: str

class AgentStatus(BaseModel):
    agent_id: str
    name: str
    task: str
    status: Literal["waiting_for_human", "approved", "denied"]
    created_at: str
    question: str

class HumanResponseRequest(BaseModel):
    response: Literal["confirm", "deny"]

@DBOS.workflow()
def durable_agent(request: AgentStartRequest):
    # Set agent status for observability
    agent_status: AgentStatus = AgentStatus(
        agent_id=DBOS.workflow_id,
        name=request.name,
        task=request.task,
        status="waiting_for_human",
        created_at=datetime.now().isoformat(),
        question=f"Should I proceed with task: {request.task}?"

    )
    DBOS.set_event(AGENT_STATUS, agent_status)
    print("Starting agent:", agent_status)

    # Wait for human-in-the-loop approval or denial
    approval: Optional[HumanResponseRequest] = DBOS.recv()
    
    if approval is None:
        # If approval times out, treat it as a denial
        agent_status.status = "denied"
        DBOS.set_event(AGENT_STATUS, agent_status)
        print("Agent timed out:", agent_status)
        raise Exception("Agent timed out awaiting approvial")
    elif approval.response == "deny":
        agent_status.status = "denied"
        DBOS.set_event(AGENT_STATUS, agent_status)
        print("Agent denied:", agent_status)
        raise Exception("Agent denied approval")
    else:
        agent_status.status = "approved"
        print("Agent approved:", agent_status)
        DBOS.set_event(AGENT_STATUS, agent_status)

    return "Agent successful"


@app.post("/agents")
def start_agent(request: AgentStartRequest):
    DBOS.start_workflow(durable_agent, request)
    return {"ok": True}

@app.get("/agents/waiting", response_model=list[AgentStatus])
def list_waiting_agents():
    agent_workflows = DBOS.list_workflows(status="PENDING", name=durable_agent.__qualname__)
    return [DBOS.get_event(w.workflow_id, AGENT_STATUS) for w in agent_workflows]

@app.get("/agents/approved", response_model=list[AgentStatus])
def list_approved_agents():
    agent_workflows = DBOS.list_workflows(status="SUCCESS", name=durable_agent.__qualname__)
    return [DBOS.get_event(w.workflow_id, AGENT_STATUS) for w in agent_workflows]

@app.get("/agents/denied", response_model=list[AgentStatus])
def list_denied_agents():
    agent_workflows = DBOS.list_workflows(status="ERROR", name=durable_agent.__qualname__)
    return [DBOS.get_event(w.workflow_id, AGENT_STATUS) for w in agent_workflows]

@app.post("/agents/{agent_id}/respond")
def respond_to_agent(agent_id: str, response: HumanResponseRequest):
    DBOS.send(agent_id, response)
    return {"ok": True}

if __name__ == "__main__":
    config: DBOSConfig = {
        "name": "agent-inbox",
        "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
        "conductor_key": os.environ.get("CONDUCTOR_KEY")
    }
    DBOS(config=config)
    DBOS.launch()
    uvicorn.run(app, host="0.0.0.0", port=8000)