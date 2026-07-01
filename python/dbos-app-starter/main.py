import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any

import uvicorn
from dbos import DBOS, DBOSConfig, SetWorkflowID
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

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

    since = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    all_wfs = DBOS.list_workflows(
        name="scheduled_workflow",
        start_time=since,
        limit=500,
        load_input=False,
        load_output=False,
    )

    counts: dict[str, int] = {}
    for wf in all_wfs:
        counts[wf.status] = counts.get(wf.status, 0) + 1

    return {
        "cron": cron,
        "schedule_status": schedule_status,
        "workflow_counts": counts,
    }


@app.post("/schedule/apply")
async def apply_schedule_endpoint(body: dict):
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


if __name__ == "__main__":
    DBOS.launch()
    DBOS.apply_schedules([{
        "schedule_name": SCHEDULE_NAME,
        "workflow_fn": scheduled_workflow,
        "schedule": DEFAULT_CRON,
        "context": None,
    }])
    uvicorn.run(app, host="0.0.0.0", port=8000)
