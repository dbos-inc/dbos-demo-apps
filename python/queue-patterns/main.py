import os
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import uvicorn
from dbos import DBOS, DBOSConfig, Debouncer, SetEnqueueOptions
from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()
api = APIRouter(prefix="/api")


#######################
## Fair Queueing
#######################


# The set of tenants the UI offers and the randomized batch draws from.
FAIR_QUEUE_TENANTS = ["alice", "bob", "clark", "dave", "ed"]


@api.post("/workflows/fair_queue")
def submit_fair_queue(tenant_id: str):
    # Enqueue a single "concurrency manager" workflow to the partitioned
    # queue to enforce per-partition limits.
    with SetEnqueueOptions(queue_partition_key=tenant_id):
        DBOS.enqueue_workflow("partitioned-queue", fair_queue_concurrency_manager)


@api.post("/workflows/fair_queue/random_mix")
def submit_fair_queue_random_mix():
    total = 50
    favored = random.choice(FAIR_QUEUE_TENANTS[0:4])  
    weights = [2 if t == favored else 1 for t in FAIR_QUEUE_TENANTS[0:4]]
    picks = random.choices(FAIR_QUEUE_TENANTS[0:4], weights=weights, k=total)
    for tenant in picks:
        with SetEnqueueOptions(queue_partition_key=tenant):
            DBOS.enqueue_workflow("partitioned-queue", fair_queue_concurrency_manager)
            time.sleep(0.01)
    return {"total": total, "favored": favored}


@DBOS.workflow()
def fair_queue_concurrency_manager():
    # The "concurrency manager" workflow enqueues the
    # workflow on the non-partitioned queue and
    # awaits its results to enforce global flow control limits.
    return DBOS.enqueue_workflow("concurrency-queue", fair_queue_workflow).get_result()


# This workflow is fairly queued: at most five workflows can run concurrently,
# but no more than one per tenant.
@DBOS.workflow()
def fair_queue_workflow():
    time.sleep(5)


#######################
## Rate Limiting
#######################


@api.post("/workflows/rate_limited_queue")
def submit_rate_limited_queue():
    DBOS.enqueue_workflow("rate-limited-queue", rate_limited_queue_workflow)


# This workflow is rate-limited: No more than two workflows can start per 10 seconds
@DBOS.workflow()
def rate_limited_queue_workflow():
    time.sleep(5)


#######################
## Debouncing
#######################


@DBOS.workflow()
def debouncer_workflow(tenant_id: str, input: str):
    print(f"Executing debounced workflow for tenant {tenant_id} with input {input}")
    time.sleep(5)


# Each time a new input is submitted for a tenant, debounce debouncer_workflow.
# The debouncer will wait until 5 seconds after input stops being submitted for the tenant,
# then enqueue the workflow with the last input submitted.
debouncer = Debouncer.create(debouncer_workflow, queue="debouncer-queue")


@api.post("/workflows/debouncer")
def submit_debounced_workflow(tenant_id: str, input: str):
    debounce_key = tenant_id
    debounce_period_sec = 10
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


@api.get("/fair_queue/pipeline")
def fair_queue_pipeline():
    # The "concurrency manager" workflows run on the partitioned queue and carry the
    # partition key (tenant_id) natively.
    enqueued_mgrs = DBOS.list_workflows(name="fair_queue_concurrency_manager", status=["ENQUEUED", "PENDING"])
    since = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    success_mgrs = DBOS.list_workflows(
        name="fair_queue_concurrency_manager", status="SUCCESS", start_time=since
    )

    # The actual work runs on the concurrency queue. Those workflows have no partition
    # key of their own, so we inherit it from the parent manager that enqueued them.
    pending_work = DBOS.list_workflows(name="fair_queue_workflow", status="PENDING")
    mgr_key = {m.workflow_id: m.queue_partition_key for m in enqueued_mgrs}

    def counts_by_tenant(wfs):
        counts: dict[str, int] = {}
        for w in wfs:
            tenant = w.queue_partition_key or "unknown"
            counts[tenant] = counts.get(tenant, 0) + 1
        return [{"tenant_id": t, "count": c} for t, c in counts.items()]

    return {
        "enqueued": counts_by_tenant(enqueued_mgrs),
        "pending_concurrency": [
            {
                "workflow_id": w.workflow_id,
                "tenant_id": mgr_key.get(w.parent_workflow_id, "unknown"),
            }
            for w in pending_work
        ],
        "success": counts_by_tenant(success_mgrs),
    }


@api.get("/debouncer/pipeline")
def debouncer_pipeline():
    # A debounced workflow is DELAYED while its debounce window is still open,
    # then ENQUEUED when it fires, PENDING while running, then SUCCESS. We
    # surface the tenant and its (latest) input for each stage. Deduplication on
    # the tenant key means there is at most one DELAYED workflow per tenant —
    # i.e. the last input submitted wins.
    delayed = DBOS.list_workflows(name="debouncer_workflow", status="DELAYED", sort_desc=True)
    pending = DBOS.list_workflows(name="debouncer_workflow", status="PENDING", sort_desc=True)
    since = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    completed = DBOS.list_workflows(
        name="debouncer_workflow", status="SUCCESS", start_time=since, sort_desc=True
    )

    def to_items(wfs):
        items = []
        for w in wfs:
            args = (w.input or {}).get("args", [])
            items.append(
                {
                    "workflow_id": w.workflow_id,
                    "tenant_id": args[0] if len(args) > 0 else "unknown",
                    "input": args[1] if len(args) > 1 else "",
                    "start_time": w.created_at,
                    # For DELAYED workflows this is when the debounce window closes
                    # and the workflow will run; null once it has left DELAYED.
                    "delay_until": w.delay_until_epoch_ms,
                    # When the workflow actually started running (it left the
                    # debounce window), which is what the completed list sorts by.
                    "ran_at": w.dequeued_at or w.created_at,
                }
            )
        return items

    return {
        "delayed": to_items(delayed),
        "pending": to_items(pending),
        "completed": to_items(completed),
    }


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
    DBOS.register_queue("concurrency-queue", worker_concurrency=4)
    DBOS.register_queue("partitioned-queue", partition_queue=True, concurrency=2)
    DBOS.register_queue("rate-limited-queue", limiter={"limit": 2, "period": 10})
    DBOS.register_queue("debouncer-queue")
    uvicorn.run(app, host="0.0.0.0", port=8000)
