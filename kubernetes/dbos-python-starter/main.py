import os
import time
from datetime import datetime

import uvicorn
from dbos import DBOS, DBOSConfig, Queue, SetWorkflowID
from fastapi import FastAPI

STEPS_EVENT = "steps_event"

app = FastAPI()

config: DBOSConfig = {
    "name": "dbos-k8s-app",
    "system_database_url": os.environ["DBOS_SYSTEM_DATABASE_URL"],
    "conductor_key": os.environ["DBOS_CONDUCTOR_KEY"],
}
DBOS(config=config)

# Database-backed queues, bound in main() below after DBOS.launch().
# DBOS.register_queue (vs. the plain Queue() constructor) persists the queue's
# worker_concurrency etc. to the system database. Conductor's GetQueue endpoint
# reads from that table, so this is what makes worker_concurrency visible to
# the operator's metrics adapter (otherwise it returns null).
#
# Three queues: taskQueue + reportsQueue are 12s service-time; bulkQueue is
# 15s. Every 10s the scheduled workflow fans out one workflow per queue, so
# all three queues run in overload — the operator's adapter picks the busiest
# and surfaces it via dbos_queue_load.
QUEUE_DURATIONS: dict[str, int] = {
    "taskQueue": 12,
    "reportsQueue": 12,
    "bulkQueue": 15,
}
queues: dict[str, Queue] = {}


@DBOS.step()
def step_one():
    time.sleep(5)
    DBOS.logger.info("Step one completed!")


@DBOS.step()
def step_two():
    time.sleep(5)
    DBOS.logger.info("Step two completed!")


@DBOS.step()
def step_three():
    time.sleep(5)
    DBOS.logger.info("Step three completed!")


@DBOS.workflow()
def example_workflow() -> str:
    for i, fn in enumerate((step_one, step_two, step_three), start=1):
        fn()
        DBOS.set_event(STEPS_EVENT, i)
    return "Workflow completed"


@DBOS.workflow()
def sleep_workflow(duration_seconds: int) -> str:
    DBOS.logger.info(f"sleep_workflow starting ({duration_seconds}s)")
    DBOS.sleep(duration_seconds)
    return f"Slept for {duration_seconds} seconds"


@DBOS.workflow()
def long_sleep_workflow() -> str:
    DBOS.sleep(10 * 60 * 60)
    return "Slept for 10 hours"


# Scheduled workflow: every 10 seconds, enqueue one sleep_workflow per queue
# at that queue's configured service time. Arrival rate (0.1/s/queue) > per-replica
# service rate (3/12s or 3/15s, with worker_concurrency=3), so every queue runs in
# overload and depth grows linearly until HPA scales replicas in.
@DBOS.scheduled("*/10 * * * * *")
@DBOS.workflow()
def schedule_sleep(scheduled_time: datetime, actual_time: datetime) -> None:
    for queue_name, duration in QUEUE_DURATIONS.items():
        queues[queue_name].enqueue(sleep_workflow, duration)


@app.get("/healthz")
def healthz():
    return "ok"


@app.get("/workflow/{task_id}")
def run_workflow(task_id: str):
    with SetWorkflowID(task_id):
        DBOS.start_workflow(example_workflow)
    return {"workflow_id": task_id, "status": "started"}


@app.get("/last_step/{task_id}")
def last_step(task_id: str):
    try:
        step = DBOS.get_event(task_id, STEPS_EVENT, timeout_seconds=0)
    except KeyError:
        step = 0
    return {"last_step": step or 0}


@app.get("/enqueue/{queue_name}/{duration}")
def enqueue(queue_name: str, duration: int):
    if queue_name not in queues:
        return {"error": f"unknown queue {queue_name!r}", "known": list(queues)}
    handle = queues[queue_name].enqueue(sleep_workflow, duration)
    return {"workflow_id": handle.workflow_id, "queue": queue_name, "duration": duration}


@app.get("/long_sleep")
def start_long_sleep():
    handle = DBOS.start_workflow(long_sleep_workflow)
    return {"workflow_id": handle.workflow_id, "duration_seconds": 10 * 60 * 60}


@app.get("/enqueue_batch/{queue_name}/{count}/{duration}")
def enqueue_batch(queue_name: str, count: int, duration: int):
    if queue_name not in queues:
        return {"error": f"unknown queue {queue_name!r}", "known": list(queues)}
    workflow_ids = [
        queues[queue_name].enqueue(sleep_workflow, duration).workflow_id
        for _ in range(count)
    ]
    return {
        "queue": queue_name,
        "count": count,
        "duration": duration,
        "workflow_ids": workflow_ids,
    }


@app.get("/metrics/{queue_name}")
def metrics(queue_name: str):
    workflows = DBOS.list_queued_workflows(queue_name=queue_name)
    return {"queue_length": len(workflows)}


if __name__ == "__main__":
    DBOS.launch()
    for queue_name in QUEUE_DURATIONS:
        queues[queue_name] = DBOS.register_queue(queue_name, worker_concurrency=3)
    uvicorn.run(app, host="0.0.0.0", port=8000)
