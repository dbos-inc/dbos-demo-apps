import os
import random
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import uvicorn
from dbos import DBOS, DBOSConfig, SetEnqueueOptions, SetWorkflowID, WorkflowStatus
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

# Welcome to DBOS!
# This example shows you how to use DBOS to build applications
# that are resilient to any failure.

app = FastAPI()
config: DBOSConfig = {
    "name": "dbos-app-starter",
    "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
    "application_version": "0.1.0",
    "conductor_key": os.environ.get("DBOS_CONDUCTOR_KEY"),
}
DBOS(config=config)

steps_event = "steps_event"

SCHEDULE_NAME = "scheduled-workflow"
DEFAULT_CRON = "*/5 * * * * *"

QUEUE_NAME = "demo-queue"
DEFAULT_WORKER_CONCURRENCY = 3

RATE_LIMITED_QUEUE_NAME = "rate-limited-queue"
DEFAULT_RATE_LIMIT = {"limit": 2, "period": 10}

FAIR_QUEUE_NAME = "fair-queue"
DEFAULT_PARTITION_CONCURRENCY = 1
DEFAULT_FAIR_WORKER_CONCURRENCY = 4
# The tenants the frontend offers. The random mix draws from the first four,
# leaving "ed" free to show a newcomer isn't stuck behind their backlog.
FAIR_QUEUE_TENANTS = ["alice", "bob", "clark", "dave", "ed"]

DELAYED_QUEUE_NAME = "delayed-queue"
# The longest delay the demo accepts: one day. DBOS itself has no hard limit.
MAX_DELAY_SECONDS = 24 * 60 * 60
DELAY_ERROR = f"delay_seconds must be a whole number from 1 to {MAX_DELAY_SECONDS}"


# This endpoint uses DBOS to launch a durable workflow.
@app.get("/workflow/{task_id}")
def launch_durable_workflow(task_id: str) -> None:
    with SetWorkflowID(task_id):
        DBOS.start_workflow(workflow)


# Here is the code for a durable workflow with three steps.
# DBOS workflows are resilient to any failure: if your program is crashed,
# interrupted, or restarted while running this workflow, it automatically
# resumes from its last completed step.
@DBOS.step()
def step_one():
    time.sleep(5)
    DBOS.logger.info("Completed step 1!")


@DBOS.step()
def step_two():
    time.sleep(5)
    DBOS.logger.info("Completed step 2!")


@DBOS.step()
def step_three():
    time.sleep(5)
    DBOS.logger.info("Completed step 3!")


@DBOS.workflow()
def workflow():
    step_one()
    # Use DBOS.set_event to publish progress for the frontend to display.
    DBOS.set_event(steps_event, 1)
    step_two()
    DBOS.set_event(steps_event, 2)
    step_three()
    DBOS.set_event(steps_event, 3)


# Scheduled workflow: runs on a cron schedule, sleeps 5 seconds between log lines.
@DBOS.workflow()
def scheduled_workflow(scheduled_time: datetime, context: Any):
    DBOS.logger.info("Scheduled workflow starting.")
    DBOS.sleep(1)
    DBOS.logger.info("Scheduled workflow ending.")


# This endpoint retrieves the status of a workflow.
@app.get("/last_step/{task_id}")
def get_last_completed_step(task_id: str):
    try:
        step = DBOS.get_event(task_id, steps_event, timeout_seconds=0)
    except KeyError:  # If the task hasn't started yet
        return 0
    return step if step is not None else 0


# This endpoint crashes the application. For demonstration purposes only :)
@app.post("/crash")
def crash_application():
    os._exit(1)


# This endpoint serves the HTML frontend.
@app.get("/")
def readme():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)


# ---- Helpers ----

# RFC 3339 timestamp for 10 minutes ago.
def ten_minutes_ago() -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()


# Count workflows grouped by status (matches the frontend summary panels).
def count_by_status(wfs: list[WorkflowStatus]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for wf in wfs:
        counts[wf.status] = counts.get(wf.status, 0) + 1
    return counts


# Count workflows per tenant. Each workflow's partition key is its tenant.
def count_by_tenant(wfs: list[WorkflowStatus]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for wf in wfs:
        tenant = wf.queue_partition_key or "unknown"
        counts[tenant] = counts.get(tenant, 0) + 1
    return [{"tenant_id": tenant, "count": count} for tenant, count in counts.items()]


# Workflows on the given queue started in the last 10 minutes, newest first.
def recent_on_queue(queue_name: str) -> list[WorkflowStatus]:
    return DBOS.list_workflows(
        queue_name=queue_name,
        start_time=ten_minutes_ago(),
        sort_desc=True,
        limit=500,
        load_input=False,
        load_output=False,
    )


# Parse a request field (a JSON number or string) as an integer >= 1, or return None.
def parse_positive_int(value: Any) -> Optional[int]:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return int(n) if n >= 1 and n.is_integer() else None


# Parse a request field as a trimmed name of 1 to 40 characters, or return None.
def parse_name(value: Any) -> Optional[str]:
    s = str(value or "").strip()
    return s if 0 < len(s) <= 40 else None


# Parse a request field as a whole number of seconds from 1 to MAX_DELAY_SECONDS, or return None.
def parse_delay_seconds(value: Any) -> Optional[int]:
    n = parse_positive_int(value)
    return n if n is not None and n <= MAX_DELAY_SECONDS else None


def error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": message})


# ---- Schedule endpoints ----

@app.get("/schedule/status")
def get_schedule_status():
    try:
        sched = DBOS.get_schedule(SCHEDULE_NAME)
        cron = sched["schedule"]
        schedule_status = sched["status"]
    except Exception:
        cron = DEFAULT_CRON
        schedule_status = "UNKNOWN"

    all_wfs = DBOS.list_workflows(
        name="scheduled_workflow",
        start_time=ten_minutes_ago(),
        limit=500,
        load_input=False,
        load_output=False,
    )

    return {
        "cron": cron,
        "schedule_status": schedule_status,
        "workflow_counts": count_by_status(all_wfs),
    }


@app.post("/schedule/apply")
def apply_schedule_endpoint(body: dict):
    cron = body.get("cron", DEFAULT_CRON)
    DBOS.apply_schedules([{
        "schedule_name": SCHEDULE_NAME,
        "workflow_fn": scheduled_workflow,
        "schedule": cron,
        "context": None,
    }])
     # explicitly resume so Apply always leaves the schedule active.
    try:
        DBOS.resume_schedule(SCHEDULE_NAME)
    except Exception:
        pass
    return {"ok": True}

@app.post("/schedule/pause")
def pause_schedule():
    DBOS.pause_schedule(SCHEDULE_NAME)
    return {"ok": True}


@app.post("/schedule/resume")
def resume_schedule():
    DBOS.resume_schedule(SCHEDULE_NAME)
    return {"ok": True}


@app.post("/schedule/trigger")
def trigger_schedule():
    DBOS.trigger_schedule(SCHEDULE_NAME)
    return {"ok": True}


# ---- Queues tab: every sub-page enqueues this same workflow, each on its own
# queue, so the differences you see come from the queues alone ----

@DBOS.workflow()
def queue_workflow():
    DBOS.sleep(5)


# ---- Queues tab, worker concurrency: a queue with adjustable worker concurrency ----

@app.get("/queue/status")
def get_queue_status():
    queue = DBOS.retrieve_queue(QUEUE_NAME)
    worker_concurrency = queue.worker_concurrency if queue else DEFAULT_WORKER_CONCURRENCY
    return {
        "worker_concurrency": worker_concurrency,
        "workflow_counts": count_by_status(recent_on_queue(QUEUE_NAME)),
    }


@app.post("/queue/enqueue")
def enqueue_workflow_endpoint():
    DBOS.enqueue_workflow(QUEUE_NAME, queue_workflow)
    return {"ok": True}


@app.post("/queue/concurrency")
def update_queue_concurrency(body: dict):
    concurrency = int(body.get("concurrency", DEFAULT_WORKER_CONCURRENCY))
    DBOS.register_queue(QUEUE_NAME, worker_concurrency=concurrency, on_conflict="always_update")
    return {"ok": True}


# ---- Queues tab, rate limiting: a queue that starts at most `limit` workflows
# every `period` seconds. The rate limit can be changed at runtime. ----

@app.get("/queue/rate/status")
def get_rate_status():
    queue = DBOS.retrieve_queue(RATE_LIMITED_QUEUE_NAME)
    limiter = (queue.limiter if queue else None) or DEFAULT_RATE_LIMIT
    wfs = recent_on_queue(RATE_LIMITED_QUEUE_NAME)
    return {
        "limit_per_period": limiter["limit"],
        "period_sec": limiter["period"],
        "workflow_counts": count_by_status(wfs),
        # The newest workflows. started_at is when the queue let each one start,
        # so the gaps between start times show the rate limit at work.
        "workflows": [
            {
                "workflow_id": wf.workflow_id,
                "status": wf.status,
                "enqueued_at": wf.created_at,
                "started_at": wf.dequeued_at,
            }
            for wf in wfs[:50]
        ],
    }


@app.post("/queue/rate/enqueue")
def enqueue_rate_limited():
    DBOS.enqueue_workflow(RATE_LIMITED_QUEUE_NAME, queue_workflow)
    return {"ok": True}


@app.post("/queue/rate/limit")
def update_rate_limit(body: dict):
    limit = parse_positive_int(body.get("limit_per_period"))
    period = parse_positive_int(body.get("period_sec"))
    if limit is None or period is None:
        return error(400, "limit and period must be whole numbers of at least 1")
    DBOS.retrieve_queue(RATE_LIMITED_QUEUE_NAME).set_limiter({"limit": limit, "period": period})
    return {"ok": True}


# ---- Queues tab, fair queues: a queue partitioned by tenant.
# partition_concurrency limits how many workflows each tenant runs at once,
# and worker_concurrency limits how many run on this process in total,
# so one busy tenant can't starve the others.
# Both limits can be changed at runtime. ----

# Enqueue one workflow in the tenant's partition of the fair queue.
def enqueue_for_tenant(tenant_id: str) -> None:
    with SetEnqueueOptions(queue_partition_key=tenant_id):
        DBOS.enqueue_workflow(FAIR_QUEUE_NAME, queue_workflow)


@app.get("/queue/fair/status")
def get_fair_status():
    queue = DBOS.retrieve_queue(FAIR_QUEUE_NAME)

    def list_fair_queue(status: str, start_time: Optional[str] = None) -> list[WorkflowStatus]:
        return DBOS.list_workflows(
            queue_name=FAIR_QUEUE_NAME,
            status=status,
            start_time=start_time,
            load_input=False,
            load_output=False,
        )

    return {
        "partition_concurrency": (queue.partition_concurrency if queue else None)
        or DEFAULT_PARTITION_CONCURRENCY,
        "worker_concurrency": (queue.worker_concurrency if queue else None)
        or DEFAULT_FAIR_WORKER_CONCURRENCY,
        "enqueued": count_by_tenant(list_fair_queue("ENQUEUED")),
        "pending": [
            {"workflow_id": wf.workflow_id, "tenant_id": wf.queue_partition_key or "unknown"}
            for wf in list_fair_queue("PENDING")
        ],
        "success": count_by_tenant(list_fair_queue("SUCCESS", ten_minutes_ago())),
    }


@app.post("/queue/fair/enqueue")
def enqueue_fair(body: dict):
    tenant_id = parse_name(body.get("tenant_id"))
    if tenant_id is None:
        return error(400, "Tenant names must be 1 to 40 characters")
    enqueue_for_tenant(tenant_id)
    return {"ok": True}


# Enqueue a batch of workflows across four tenants, skewed toward one of them.
@app.post("/queue/fair/random_mix")
def enqueue_fair_random_mix():
    total = 50
    tenants = FAIR_QUEUE_TENANTS[:4]
    favored = random.choice(tenants)
    # The favored tenant is twice as likely to be picked. Picks are made one
    # at a time, so the workflows arrive in randomized order.
    weighted = tenants + [favored]
    for _ in range(total):
        enqueue_for_tenant(random.choice(weighted))
        time.sleep(0.01)
    return {"total": total, "favored": favored}


@app.post("/queue/fair/limits")
def update_fair_limits(body: dict):
    partition_concurrency = parse_positive_int(body.get("partition_concurrency"))
    worker_concurrency = parse_positive_int(body.get("worker_concurrency"))
    if partition_concurrency is None or worker_concurrency is None:
        return error(400, "partition_concurrency and worker_concurrency must be whole numbers of at least 1")
    queue = DBOS.retrieve_queue(FAIR_QUEUE_NAME)
    queue.set_partition_concurrency(partition_concurrency)
    queue.set_worker_concurrency(worker_concurrency)
    return {"ok": True}


# ---- Queues tab, delays: enqueue a workflow that waits before running.
# The workflow stays DELAYED until its delay expires, then becomes ENQUEUED and
# runs. While it's DELAYED, its delay can be changed to run it sooner or later.
# The delay is stored in the database, so it survives restarts. ----

@app.get("/queue/delay/status")
def get_delay_status():
    # List every workflow still in progress, plus any created in the last 10 minutes.
    active = DBOS.list_workflows(
        queue_name=DELAYED_QUEUE_NAME,
        status=["DELAYED", "ENQUEUED", "PENDING"],
        load_input=False,
        load_output=False,
    )
    by_id = {wf.workflow_id: wf for wf in recent_on_queue(DELAYED_QUEUE_NAME) + active}
    newest = sorted(by_id.values(), key=lambda wf: wf.created_at or 0, reverse=True)[:50]
    return {
        "workflows": [
            {
                "workflow_id": wf.workflow_id,
                "status": wf.status,
                "enqueued_at": wf.created_at,
                # When the delay expires and the workflow becomes eligible to run.
                "due_at": wf.delay_until_epoch_ms,
            }
            for wf in newest
        ]
    }


@app.post("/queue/delay/enqueue")
def enqueue_delayed(body: dict):
    delay_seconds = parse_delay_seconds(body.get("delay_seconds"))
    if delay_seconds is None:
        return error(400, DELAY_ERROR)
    with SetEnqueueOptions(delay_seconds=delay_seconds):
        DBOS.enqueue_workflow(DELAYED_QUEUE_NAME, queue_workflow)
    return {"ok": True}


# Change a workflow's delay, counting from now. DBOS only changes the delay
# of a workflow that is still DELAYED.
@app.post("/queue/delay/set/{workflow_id}")
def set_delay(workflow_id: str, body: dict):
    delay_seconds = parse_delay_seconds(body.get("delay_seconds"))
    if delay_seconds is None:
        return error(400, DELAY_ERROR)
    status = DBOS.get_workflow_status(workflow_id)
    if status is None or status.queue_name != DELAYED_QUEUE_NAME:
        return error(404, "Delayed workflow not found")
    if status.status != "DELAYED":
        return error(409, f"The workflow is {status.status}, so its delay can no longer change")
    DBOS.set_workflow_delay(workflow_id, delay_seconds=delay_seconds)
    return {"ok": True}


# ---- Workflow Communication ----

APPROVAL_TOPIC = "approval"
COMM_STATUS_EVENT = "comm_status"

@DBOS.step()
def comm_step_one():
    time.sleep(2)
    DBOS.logger.info("Communication workflow: step 1 complete.")


@DBOS.step()
def comm_step_two():
    time.sleep(2)
    DBOS.logger.info("Communication workflow: step 2 complete.")


@DBOS.workflow()
def communication_workflow():
    comm_step_one()
    DBOS.set_event(COMM_STATUS_EVENT, "waiting")
    decision = DBOS.recv(APPROVAL_TOPIC, timeout_seconds=15)
    if decision == "approve":
        DBOS.set_event(COMM_STATUS_EVENT, "step2")
        comm_step_two()
        DBOS.set_event(COMM_STATUS_EVENT, "completed")
    elif decision == "deny":
        DBOS.set_event(COMM_STATUS_EVENT, "denied")
        DBOS.logger.info("Communication workflow: denied.")
    else:
        # recv returns None on timeout. Raising ends the workflow in the ERROR state.
        raise TimeoutError("Timed out waiting for approval")


@app.get("/comm/status/{workflow_id}")
def get_comm_status(workflow_id: str):
    # The workflow's own status (e.g. PENDING, SUCCESS) tells the page when it can be rewound.
    wf = DBOS.get_workflow_status(workflow_id)
    workflow_status = wf.status if wf else None
    # The workflow raises when it times out waiting for approval, so it ends in ERROR.
    if workflow_status == "ERROR":
        return {"state": "timeout", "error": str(wf.error or ""), "workflow_status": workflow_status}
    try:
        status = DBOS.get_event(workflow_id, COMM_STATUS_EVENT, timeout_seconds=0)
    except Exception:
        status = None
    return {"state": status or "step1", "workflow_status": workflow_status}


# ---- Rewind ----
# Rewinding a finished workflow discards its steps from a chosen step onward and
# runs it again from there, under the same workflow ID.

# The workflow states this demo rewinds from. (DBOS can rewind a workflow in any
# terminal state; this one finishes in SUCCESS, or ERROR if it fails.)
REWINDABLE_STATES = {"SUCCESS", "ERROR"}


# The steps the page offers as rewind points, by the name DBOS records for each.
# DBOS also records the workflow's other operations (like DBOS.setEvent) as steps.
REWIND_POINTS = {
    "comm_step_one": "comm_step_one()",
    "DBOS.recv": 'decision = DBOS.recv("approval")',
    "comm_step_two": "comm_step_two()",
}


# The points a workflow can be rewound to, with the step ID rewind_workflow takes for each.
@app.get("/comm/steps/{workflow_id}")
def get_comm_steps(workflow_id: str):
    steps = DBOS.list_workflow_steps(workflow_id, load_output=False)
    return [
        {"step": s["function_id"], "label": REWIND_POINTS[s["function_name"]]}
        for s in steps
        if s["function_name"] in REWIND_POINTS
    ]


@app.post("/comm/rewind/{workflow_id}")
def rewind_comm(workflow_id: str, body: dict):
    start_step = body.get("start_step")
    if not isinstance(start_step, int) or start_step < 1:
        return JSONResponse(status_code=400, content={"error": "start_step must be a step ID of at least 1"})
    wf = DBOS.get_workflow_status(workflow_id)
    if wf is None:
        return JSONResponse(status_code=404, content={"error": "Workflow not found"})
    if wf.status not in REWINDABLE_STATES:
        return JSONResponse(status_code=409, content={"error": f"The workflow is {wf.status}; only a finished workflow can be rewound"})
    DBOS.rewind_workflow(workflow_id, start_step=start_step)
    return {"ok": True}


@app.post("/comm/start")
def start_comm_workflow():
    wf_id = str(uuid.uuid4()).replace("-", "")[:12]
    with SetWorkflowID(wf_id):
        DBOS.start_workflow(communication_workflow)
    return {"workflow_id": wf_id}


@app.post("/comm/approve/{workflow_id}")
def approve_comm(workflow_id: str):
    DBOS.send(workflow_id, "approve", APPROVAL_TOPIC)
    return {"ok": True}


@app.post("/comm/deny/{workflow_id}")
def deny_comm(workflow_id: str):
    DBOS.send(workflow_id, "deny", APPROVAL_TOPIC)
    return {"ok": True}


if __name__ == "__main__":
    DBOS.launch()
    # Register the demo queues (after launch). "never_update" keeps any
    # settings changed at runtime across restarts.
    DBOS.register_queue(QUEUE_NAME, worker_concurrency=DEFAULT_WORKER_CONCURRENCY, on_conflict="never_update")
    DBOS.register_queue(RATE_LIMITED_QUEUE_NAME, limiter=DEFAULT_RATE_LIMIT, on_conflict="never_update")
    DBOS.register_queue(
        FAIR_QUEUE_NAME,
        partition_concurrency=DEFAULT_PARTITION_CONCURRENCY,
        worker_concurrency=DEFAULT_FAIR_WORKER_CONCURRENCY,
        on_conflict="never_update",
    )
    DBOS.register_queue(DELAYED_QUEUE_NAME, on_conflict="never_update")
    uvicorn.run(app, host="0.0.0.0", port=8000)
