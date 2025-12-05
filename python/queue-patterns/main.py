import os
import time
from typing import List, Optional

from pydantic import BaseModel
import uvicorn
from dbos import DBOS, DBOSConfig, Queue, SetEnqueueOptions
from fastapi import APIRouter, FastAPI

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

#######################
## Debouncing
#######################

#######################
## Observability
#######################


class WorkflowStatus(BaseModel):
    workflow_id: str
    workflow_status: str
    workflow_name: str
    tenant_id: Optional[int]


@api.get("/workflows")
def list_workflows(workflow_name: str) -> List[WorkflowStatus]:
    workflows = DBOS.list_workflows(name=workflow_name)
    statuses = []
    for w in workflows:
        status = WorkflowStatus(
            workflow_id=w.workflow_id,
            workflow_status=w.status,
            workflow_name=w.name,
            tenant_id=w.queue_partition_key,
        )
        statuses.append(status)
    return statuses


#######################
## Configuration
#######################


if __name__ == "__main__":
    config: DBOSConfig = {
        "name": "dbos-queue-patterns",
        "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
    }
    DBOS(config=config)
    DBOS.launch()
    uvicorn.run(app, host="0.0.0.0", port=8000)
