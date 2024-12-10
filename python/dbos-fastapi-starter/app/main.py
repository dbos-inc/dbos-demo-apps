import os
import time

from dbos import DBOS, SetWorkflowID
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

# Welcome to DBOS!
# This is a template application built with DBOS and FastAPI.
# It shows you how to build reliable background tasks with DBOS.

app = FastAPI()
DBOS(fastapi=app)

steps_event = "steps_event"

# This endpoint uses DBOS to launch a reliable and idempotent background task with N steps.


@app.get("/background/{task_id}/{n}")
def launch_background_task(task_id: str, n: int) -> None:
    DBOS.logger.info(f"Starting a background task with {n} steps!")
    with SetWorkflowID(task_id):
        DBOS.start_workflow(example_workflow, n)


# This workflow simulates a background task with N steps.

# DBOS workflows are resilient to any failure--if your program is crashed,#
# interrupted, or restarted while running this workflow, the workflow automatically
# resumes from the last completed step.


@DBOS.workflow()
def example_workflow(n: int) -> None:
    global active_workflow
    DBOS.set_event(steps_event, 0)
    active_workflow = DBOS.workflow_id
    for i in range(1, n + 1):
        do_work(i)
        DBOS.set_event(steps_event, i)


@DBOS.step()
def do_work(i: int):
    time.sleep(1)
    DBOS.logger.info(f"Completed step {i}!")


# This endpoint retrieves the status of a specific background task.


@app.get("/last_step/{task_id}")
def get_last_completed_step(task_id: str):
    step = DBOS.get_event(task_id, steps_event)
    return step if step is not None else 0


# This endpoint crashes the application. For demonstration purposes only :)


@app.post("/crash")
def crash_application():
    os._exit(1)


# This code uses FastAPI to serve an HTML + CSS readme from the root path.


@app.get("/")
def readme():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)
