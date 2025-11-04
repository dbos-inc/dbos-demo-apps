from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Literal
from datetime import datetime
from uuid import uuid4

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AgentStartRequest(BaseModel):
    name: str
    task: str

class AgentResponse(BaseModel):
    agent_id: str
    name: str
    task: str
    status: Literal["waiting_for_human", "approved", "denied"]
    created_at: str
    question: str

class HumanResponseRequest(BaseModel):
    response: Literal["confirm", "deny"]

agents_db: dict[str, dict] = {}

@app.post("/agents", response_model=AgentResponse)
def start_agent(request: AgentStartRequest):
    agent_id = str(uuid4())
    now = datetime.now().isoformat()

    agent_data = {
        "agent_id": agent_id,
        "name": request.name,
        "task": request.task,
        "status": "waiting_for_human",
        "created_at": now,
        "question": f"Should I proceed with task: {request.task}?"
    }

    agents_db[agent_id] = agent_data
    return AgentResponse(**agent_data)

@app.get("/agents/waiting", response_model=list[AgentResponse])
def list_waiting_agents():
    return [
        AgentResponse(**agent)
        for agent in agents_db.values()
        if agent["status"] == "waiting_for_human"
    ]

@app.get("/agents/completed", response_model=list[AgentResponse])
def list_completed_agents():
    return [
        AgentResponse(**agent)
        for agent in agents_db.values()
        if agent["status"] in ["approved", "denied"]
    ]

@app.get("/agents/approved", response_model=list[AgentResponse])
def list_approved_agents():
    return [
        AgentResponse(**agent)
        for agent in agents_db.values()
        if agent["status"] == "approved"
    ]

@app.get("/agents/denied", response_model=list[AgentResponse])
def list_denied_agents():
    return [
        AgentResponse(**agent)
        for agent in agents_db.values()
        if agent["status"] == "denied"
    ]

@app.post("/agents/{agent_id}/respond", response_model=AgentResponse)
def respond_to_agent(agent_id: str, response: HumanResponseRequest):
    if agent_id not in agents_db:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent = agents_db[agent_id]

    if agent["status"] != "waiting_for_human":
        raise HTTPException(status_code=400, detail="Agent is not waiting for response")

    agent["status"] = "approved" if response.response == "confirm" else "denied"

    return AgentResponse(**agent)
