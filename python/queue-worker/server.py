import os
from pathlib import Path
from typing import List, Optional

import uvicorn
from dbos import DBOSClient, EnqueueOptions
from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Create a FastAPI app and API router
app = FastAPI()
api = APIRouter(prefix="/api")

# Create a DBOS client
system_database_url = os.environ.get(
    "DBOS_SYSTEM_DATABASE_URL", "sqlite:///dbos_queue_worker.sqlite"
)
client = DBOSClient(system_database_url=system_database_url)


# Define constants and models
WF_PROGRESS_KEY = "workflow_progress"
frontend_dist = Path(__file__).parent / "frontend" / "dist"


class WorkflowStatus(BaseModel):
    workflow_id: str
    workflow_status: str
    steps_completed: Optional[int]
    num_steps: Optional[int]


@api.post("/workflows")
def enqueue_workflow():
    options: EnqueueOptions = {
        "queue_name": "workflow-queue",
        "workflow_name": "workflow",
    }
    num_steps = 10
    client.enqueue(options, num_steps)
    return {"status": "enqueued"}


@api.get("/workflows")
def list_workflows() -> List[WorkflowStatus]:
    workflows = client.list_workflows(name="workflow", sort_desc=True)
    statuses: List[WorkflowStatus] = []
    for workflow in workflows:
        progress = client.get_event(
            workflow.workflow_id, WF_PROGRESS_KEY, timeout_seconds=0
        )
        status = WorkflowStatus(
            workflow_id=workflow.workflow_id,
            workflow_status=workflow.status,
            steps_completed=progress and progress.get("steps_completed"),
            num_steps=progress and progress.get("num_steps"),
        )
        statuses.append(status)
    return statuses


# Serve the API router from the FastAPI app
app.include_router(api)


# Serve index.html for root
@app.get("/")
async def serve_index():
    return FileResponse(frontend_dist / "index.html")


# Mount static frontend files last
app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
