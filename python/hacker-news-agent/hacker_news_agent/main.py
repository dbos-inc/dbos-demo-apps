import asyncio
import os
import sys

import uvicorn
from dbos import DBOS, DBOSConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from rich.console import Console

from .models import AGENT_STATUS, AgentStartRequest, AgentStatus
from .workflows import agentic_research_workflow

console = Console()
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/agents")
def start_agent(request: AgentStartRequest):
    # Start a durable agent in the background
    DBOS.start_workflow(agentic_research_workflow, request.topic)
    return {"ok": True}

@app.get("/agents", response_model=list[AgentStatus])
async def list_agents():
    # List all active agents and retrieve their statuses
    agent_workflows = await DBOS.list_workflows_async(
        name=agentic_research_workflow.__qualname__
    )
    statuses: list[AgentStatus] = await asyncio.gather(
        *[DBOS.get_event_async(w.workflow_id, AGENT_STATUS) for w in agent_workflows]
    )
    for workflow, status in zip(agent_workflows, statuses):
        status.status = workflow.status
    return statuses

if __name__ == "__main__":
    # Validate required environment variables
    if not os.environ.get("OPENAI_API_KEY"):
        console.print(
            "[bold red]❌ Error: OPENAI_API_KEY environment variable not set[/bold red]"
        )
        console.print("Please set your OpenAI API key:")
        console.print("  export OPENAI_API_KEY='your-api-key-here'")
        sys.exit(1)

    config: DBOSConfig = {
        "name": "hacker-news-agent",
        "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
        "conductor_key": os.environ.get("CONDUCTOR_KEY"),
    }
    DBOS(config=config)
    DBOS.launch()
    uvicorn.run(app, host="0.0.0.0", port=8000)
