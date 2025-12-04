import os
from pathlib import Path
from typing import List

import uvicorn
from dbos import DBOSClient, EnqueueOptions
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

system_database_url = os.environ.get(
    "DBOS_SYSTEM_DATABASE_URL", "sqlite:///dbos_queue_worker.sqlite"
)
client = DBOSClient(system_database_url=system_database_url)

WF_PROGRESS_KEY = "worklow_progress"


class WorkflowStatus(BaseModel):
    workflow_id: str
    workflow_status: str
    steps_completed: int
    num_steps: int


@app.post("/api/workflows")
def enqueue_workflow():
    options: EnqueueOptions = {
        "queue_name": "workflow-queue",
        "workflow_name": "workflow",
    }
    num_steps = 10
    client.enqueue(options, num_steps)


@app.get("/api/workflows")
def list_workflows() -> List[WorkflowStatus]:
    workflows = client.list_workflows(name="workflow", sort_desc=True)
    statuses: List[WorkflowStatus] = []
    for workflow in workflows:
        progress = client.get_event(workflow.workflow_id, WF_PROGRESS_KEY)
        status = WorkflowStatus(
            workflow_id=workflow.workflow_id,
            workflow_status=workflow.status,
            steps_completed=progress["steps_completed"],
            num_steps=progress["num_steps"],
        )
        statuses.append(status)
    return statuses


# Serve static files and SPA fallback
frontend_dist = Path(__file__).parent / "frontend" / "dist"
app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    return FileResponse(frontend_dist / "index.html")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
