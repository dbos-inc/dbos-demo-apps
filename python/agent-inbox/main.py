import asyncio
import os
from datetime import datetime
from typing import Literal, Optional

import uvicorn
from dbos import DBOS, DBOSConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
    name: str
    task: str
    status: Literal["working", "pending_approval", "denied"]
    created_at: str
    question: str
    agent_id: Optional[str] = None


class HumanResponseRequest(BaseModel):
    response: Literal["confirm", "deny"]


@DBOS.workflow()
def durable_agent(request: AgentStartRequest):
    # Set an agent status the frontend can query
    agent_status: AgentStatus = AgentStatus(
        name=request.name,
        task=request.task,
        status="working",
        created_at=datetime.now().isoformat(),
        question=f"Should I proceed with task: {request.task}?",
    )
    DBOS.set_event(AGENT_STATUS, agent_status)
    print("Starting agent:", agent_status)

    # Do some work...

    # Upon reaching the step that needs approval, update status
    # to `pending_approval` and await an approval notification. 
    agent_status.status = "pending_approval"
    DBOS.set_event(AGENT_STATUS, agent_status)
    approval: Optional[HumanResponseRequest] = DBOS.recv(timeout_seconds=3600)

    # If approved, continue execution. Otherwise, raise an exception
    # and terminate the agent.
    if approval is None:
        # If approval times out, treat it as a denial
        agent_status.status = "denied"
        DBOS.set_event(AGENT_STATUS, agent_status)
        print("Agent timed out:", agent_status)
        raise Exception("Agent timed out awaiting approval")
    elif approval.response == "deny":
        agent_status.status = "denied"
        DBOS.set_event(AGENT_STATUS, agent_status)
        print("Agent denied:", agent_status)
        raise Exception("Agent denied approval")
    else:
        agent_status.status = "working"
        print("Agent approved:", agent_status)
        DBOS.set_event(AGENT_STATUS, agent_status)

    # Do some more work...

    return "Agent successful"


@app.post("/agents")
def start_agent(request: AgentStartRequest):
    # Start a durable agent in the background
    DBOS.start_workflow(durable_agent, request)
    return {"ok": True}


@app.get("/agents/waiting", response_model=list[AgentStatus])
async def list_waiting_agents():
    # List all active agents and retrieve their statuses
    agent_workflows = await DBOS.list_workflows_async(
        status="PENDING", name=durable_agent.__qualname__
    )
    statuses: list[AgentStatus] = await asyncio.gather(
        *[DBOS.get_event_async(w.workflow_id, AGENT_STATUS) for w in agent_workflows]
    )
    for s, w in zip(statuses, agent_workflows):
        s.agent_id = w.workflow_id
    # Only return active agents that are currently awaiting human approval
    return [status for status in statuses if status.status == "pending_approval"]


@app.get("/agents/approved", response_model=list[AgentStatus])
async def list_approved_agents():
    # List all successful agents and retrieve their statuses
    agent_workflows = await DBOS.list_workflows_async(
        status="SUCCESS", name=durable_agent.__qualname__
    )
    statuses = await asyncio.gather(
        *[DBOS.get_event_async(w.workflow_id, AGENT_STATUS) for w in agent_workflows]
    )
    return list(statuses)


@app.get("/agents/denied", response_model=list[AgentStatus])
async def list_denied_agents():
    # List all failed agents and retrieve their statuses
    agent_workflows = await DBOS.list_workflows_async(
        status="ERROR", name=durable_agent.__qualname__
    )
    statuses = await asyncio.gather(
        *[DBOS.get_event_async(w.workflow_id, AGENT_STATUS) for w in agent_workflows]
    )
    return list(statuses)


@app.post("/agents/{agent_id}/respond")
def respond_to_agent(agent_id: str, response: HumanResponseRequest):
    # Notify an agent it has been approved or denied
    DBOS.send(agent_id, response)
    return {"ok": True}


if __name__ == "__main__":
    config: DBOSConfig = {
        "name": "agent-inbox",
        "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
        "conductor_key": os.environ.get("CONDUCTOR_KEY"),
        "application_version": "0.1.0",
    }
    DBOS(config=config)
    DBOS.launch()
    uvicorn.run(app, host="0.0.0.0", port=8000)
