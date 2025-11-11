import os
import sys

import uvicorn
from dbos import DBOS, DBOSConfig
from fastapi import FastAPI
from rich.console import Console

from .models import AgentStartRequest, AgentStatus
from .workflows import agentic_research_workflow

app = FastAPI()
console = Console()


@app.post("/agents")
def start_agent(request: AgentStartRequest):
    # Start a durable agent in the background
    DBOS.start_workflow(agentic_research_workflow, request.topic)
    return {"ok": True}


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
