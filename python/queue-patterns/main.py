import os
import time
from pathlib import Path
from typing import List, Optional

import uvicorn
from dbos import DBOS, DBOSConfig, Debouncer, Queue, SetEnqueueOptions
from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()
api = APIRouter(prefix="/api")


#######################
## Fair Queueing
#######################


concurrency_queue = Queue("concurrency-queue", concurrency=5)
partitioned_queue = Queue("partitioned-queue", partition_queue=True, concurrency=1)


@api.post("/workflows/fair_queue")
def submit_fair_queue(tenant_id: str):
    # First, enqueue a "concurrency manager" workflow to the partitioned
    # queue to enforce per-partition limits.
    with SetEnqueueOptions(queue_partition_key=tenant_id):
        partitioned_queue.enqueue(fair_queue_concurrency_manager)


@DBOS.workflow()
def fair_queue_concurrency_manager():
    # The "concurrency manager" workflow enqueues the
    # workflow on the non-partitioned queue and
    # awaits its results to enforce global flow control limits.
    return concurrency_queue.enqueue(fair_queue_workflow).get_result()


# This workflow is fairly queued: at most five workflows can run concurrently,
# but no more than one per tenant.
@DBOS.workflow()
def fair_queue_workflow():
    time.sleep(5)


#######################
## Rate Limiting
#######################

rate_limited_queue = Queue("rate-limited-queue", limiter={"limit": 2, "period": 10})


@api.post("/workflows/rate_limited_queue")
def submit_rate_limited_queue():
    rate_limited_queue.enqueue(rate_limited_queue_workflow)


# This workflow is rate-limited: No more than two workflows can start per 10 seconds
@DBOS.workflow()
def rate_limited_queue_workflow():
    time.sleep(5)


#######################
## Debouncing
#######################

debouncer_queue = Queue("debouncer-queue")


@DBOS.workflow()
def debouncer_workflow(tenant_id: str, input: str):
    print(f"Executing debounced workflow for tenant {tenant_id} with input {input}")
    time.sleep(5)


# Each time a new input is submitted for a tenant, debounce debouncer_workflow.
# The debouncer will wait until 5 seconds after input stops being submitted for the tenant,
# then enqueue the workflow with the last input submitted.
debouncer = Debouncer.create(debouncer_workflow, queue=debouncer_queue)


@api.post("/workflows/debouncer")
def submit_debounced_workflow(tenant_id: str, input: str):
    debounce_key = tenant_id
    debounce_period_sec = 5
    debouncer.debounce(debounce_key, debounce_period_sec, tenant_id, input)


#######################
## Observability
#######################


class WorkflowStatus(BaseModel):
    workflow_id: str
    workflow_status: str
    workflow_name: str
    start_time: int
    tenant_id: Optional[str]
    input: Optional[str]


@api.get("/workflows")
def list_workflows(workflow_name: str) -> List[WorkflowStatus]:
    workflows = DBOS.list_workflows(name=workflow_name, sort_desc=True)
    statuses = []
    for w in workflows:
        if "fair_queue" in workflow_name:
            tenant_id = w.queue_partition_key
            input = None
        elif "rate_limited" in workflow_name:
            tenant_id, input = None, None
        elif "debouncer" in workflow_name:
            tenant_id = w.input["args"][0]
            input = w.input["args"][1]
        status = WorkflowStatus(
            workflow_id=w.workflow_id,
            workflow_status=w.status,
            workflow_name=w.name,
            start_time=w.created_at,
            tenant_id=tenant_id,
            input=input,
        )
        statuses.append(status)
    return statuses


#######################
## Configuration
#######################


# Static files directory
STATIC_DIR = Path(__file__).parent / "frontend" / "dist"

# Include API router
app.include_router(api)

# Serve static files
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


# Serve index.html for the root path
@app.get("/")
async def serve_index():
    return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    config: DBOSConfig = {
        "name": "dbos-queue-patterns",
        "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
        "application_version": "0.1.0",
    }
    DBOS(config=config)
    DBOS.launch()
    uvicorn.run(app, host="0.0.0.0", port=8000)
