import os
import time

from dbos import DBOS, SetWorkflowID
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

# Welcome to DBOS!
# This is a template application built with DBOS and FastAPI.
# It shows you how to use DBOS to build background tasks that are resilient to any failure.

app = FastAPI()
DBOS(fastapi=app)

steps_event = "steps_event"

# This endpoint uses DBOS to idempotently launch a crashproof background task with N steps.


@app.get("/background/{task_id}/{n}")
def launch_background_task(task_id: str, n: int) -> None:
    with SetWorkflowID(task_id):
        DBOS.start_workflow(workflow)


# This workflow simulates a background task with N steps.

# DBOS workflows are resilient to any failure--if your program is crashed,
# interrupted, or restarted while running this workflow, the workflow automatically
# resumes from the last completed step.

@DBOS.step()
def step_one():
    time.sleep(2)
    DBOS.logger.info("Completed step 1!")

@DBOS.step()
def step_two():
    time.sleep(2)
    DBOS.logger.info("Completed step 2!")

@DBOS.step()
def step_three():
    time.sleep(2)
    DBOS.logger.info("Completed step 3!")

@DBOS.workflow()
def workflow():
    step_one()
    DBOS.set_event(steps_event, 1)
    step_two()
    DBOS.set_event(steps_event, 2)
    step_three()
    DBOS.set_event(steps_event, 3)


# This endpoint retrieves the status of a specific background task.


@app.get("/last_step/{task_id}")
def get_last_completed_step(task_id: str):
    try:
        step = DBOS.get_event(task_id, steps_event)
    except KeyError: # If the task hasn't started yet
        return 0
    return step if step is not None else 0


# This endpoint crashes the application. For demonstration purposes only :)


@app.post("/crash")
def crash_application():
    os._exit(1)


# This code serves the HTML readme from the root path.


@app.get("/")
def readme():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)
