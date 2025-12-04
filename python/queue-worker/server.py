import os
from pathlib import Path
from typing import List, Optional

import uvicorn
from dbos import DBOSClient, EnqueueOptions
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

system_database_url = os.environ.get(
    "DBOS_SYSTEM_DATABASE_URL", "sqlite:///dbos_queue_worker.sqlite"
)
client = DBOSClient(system_database_url=system_database_url)

WF_PROGRESS_KEY = "workflow_progress"

frontend_dist = Path(__file__).parent / "frontend" / "dist"


class WorkflowStatus(BaseModel):
    workflow_id: str
    workflow_status: str
    steps_completed: Optional[int]
    num_steps: Optional[int]


@app.post("/api/workflows")
def enqueue_workflow():
    options: EnqueueOptions = {
        "queue_name": "workflow-queue",
        "workflow_name": "workflow",
    }
    num_steps = 10
    print("Enqueueing workflow")
    client.enqueue(options, num_steps)
    return {"status": "enqueued"}


@app.patch("/api/workflows")
def list_workflows() -> List[WorkflowStatus]:
    print("Listing workflows")
    workflows = client.list_workflows(name="workflow", sort_desc=True)
    statuses: List[WorkflowStatus] = []
    for workflow in workflows:
        progress = client.get_event(workflow.workflow_id, WF_PROGRESS_KEY, timeout_seconds=0)
        status = WorkflowStatus(
            workflow_id=workflow.workflow_id,
            workflow_status=workflow.status,
            steps_completed=progress["steps_completed"] if progress else None,
            num_steps=progress["num_steps"] if progress else None,
        )
        statuses.append(status)
    print(f"Found {len(statuses)} workflows")
    return statuses


@app.get("/")
async def serve_index():
    return FileResponse(frontend_dist / "index.html")


# Mount static assets
app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")


# Catch-all for SPA routing (excluding /api)
@app.exception_handler(404)
async def spa_fallback(request: Request, exc):
    if not request.url.path.startswith("/api"):
        return FileResponse(frontend_dist / "index.html")
    return JSONResponse(status_code=404, content={"detail": "Not found"})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
