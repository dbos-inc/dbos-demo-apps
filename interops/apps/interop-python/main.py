"""
DBOS Python interop app.

Registers echoWorkflow (class=interop, instance="default") on interop-queue-python.

Workflow signature (mix of positional and named args):
    positional: text (str), num (int), items (list[str])
    named:      val_float (float), val_date (str)

POST /enqueue/{target}  — accepts {positionalArgs, namedArgs} body, enqueues
                          echoWorkflow onto interop-queue-{target}, returns its result.
POST /interop/{target}  — the same call, returning {result, parentId, childId} so the
                          caller can inspect the cross-application parent/child link.
GET  /workflow/{id}     — status of any workflow in the shared system database.
GET  /steps/{id}        — the recorded steps of a workflow, with child workflow IDs.
GET  /healthz           — liveness probe.
"""

import os
from datetime import date as _date
from typing import Any, Dict, List

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi import Body

from dbos import (
    DBOS,
    DBOSConfiguredInstance,
    EnqueueOptions,
    Queue,
    WorkflowSerializationFormat,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SYS_DB_URL = os.environ["DBOS_SYSTEM_DATABASE_URL"]
PORT       = int(os.environ.get("PORT", 8001))

# All four runtimes share one system database, so each is a distinct DBOS
# application. An application's name decides what it owns — its workflows,
# queues and versions — and it only runs its own work.
APP_NAMES = {
    "python":     "interop-python",
    "typescript": "interop-typescript",
    "go":         "interop-go",
    "java":       "interop-java",
}

# Application version names are unique across every application sharing a system
# database, so each runtime carries its own rather than a common "interop-v1".
APP_VERSIONS = {lang: f"{name}-v1" for lang, name in APP_NAMES.items()}

QUEUE_NAMES = {
    "python":     "interop-queue-python",
    "typescript": "interop-queue-typescript",
    "go":         "interop-queue-go",
    "java":       "interop-queue-java",
}

# ---------------------------------------------------------------------------
# DBOS app
# ---------------------------------------------------------------------------

app = FastAPI()
DBOS(fastapi=app, config={
    "name": APP_NAMES["python"],
    "system_database_url": SYS_DB_URL,
    "application_version": APP_VERSIONS["python"],
})

_queue = Queue(QUEUE_NAMES["python"])


@DBOS.dbos_class("interop")
class InteropService(DBOSConfiguredInstance):
    """Class instance workflow — registered as instance "default" of class "interop"."""

    def __init__(self) -> None:
        super().__init__("default")

    @DBOS.workflow(
        name="echoWorkflow",
        serialization_type=WorkflowSerializationFormat.PORTABLE,
    )
    def echo_workflow(
        self,
        text: str,
        num: int,
        items: List[str],
        *,
        val_float: float = 0.0,
        val_date: str = "",
    ) -> Dict[str, Any]:
        parsed_date = _date.fromisoformat(val_date)

        # Receive a date message sent by the caller.
        msg_date_raw: str = DBOS.recv("date-msg", timeout_seconds=30)
        # Normalize to YYYY-MM-DD (sender may produce RFC 3339 or date-only).
        msg_date = msg_date_raw[:10]

        return {
            "echo_text":   text,
            "echo_num":    num,
            "echo_float":  val_float,
            "items_count": len(items),
            "echo_date":   parsed_date.isoformat(),
            "msg_date":    msg_date,
        }


# Create instance — auto-registers in instance_info_map["interop/default"]
_service = InteropService()


@DBOS.workflow(name="interopDriver")
def interop_driver(target: str, positional: List[Any], named: Dict[str, Any]) -> Dict[str, Any]:
    """Enqueue another application's echoWorkflow and wait for its result.

    This runs inside a workflow and enqueues through the runtime itself — no DBOS
    client — so the enqueued workflow is recorded as a child of this one even
    though a different application owns and runs it.
    """
    options: EnqueueOptions = {
        "queue_name":         QUEUE_NAMES[target],
        "workflow_name":      "echoWorkflow",
        "class_name":         "interop",
        "instance_name":      "default",
        "serialization_type": WorkflowSerializationFormat.PORTABLE,
        # Hand the workflow to the target application, which dequeues and runs it
        # on the version it is deployed at.
        "application_name":   APP_NAMES[target],
        "app_version":        APP_VERSIONS[target],
    }
    handle = DBOS.enqueue_workflow_with_options(options, *positional, **named)
    child_id = handle.get_workflow_id()

    # Send the date message the child workflow is waiting on. Workflow IDs are
    # unique across the whole system database, so this reaches the child no
    # matter which application runs it.
    DBOS.send(
        child_id,
        _date(2025, 3, 15),
        "date-msg",
        serialization_type=WorkflowSerializationFormat.PORTABLE,
    )

    return {
        "result":   handle.get_result(),
        "parentId": DBOS.workflow_id,
        "childId":  child_id,
    }


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def _startup() -> None:
    # Only serve our own queue. The Go and Java runtimes register their queues in
    # the database without claiming ownership, and an unowned queue is polled by
    # every application sharing the system database.
    DBOS.listen_queues([QUEUE_NAMES["python"]])
    DBOS.launch()


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


def _drive(target: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if target not in QUEUE_NAMES:
        raise HTTPException(status_code=400, detail=f"unknown target: {target!r}")
    return interop_driver(
        target,
        payload.get("positionalArgs", []),
        payload.get("namedArgs", {}),
    )


@app.post("/enqueue/{target}")
def enqueue(target: str, payload: Dict[str, Any] = Body(...)):
    return _drive(target, payload)["result"]


@app.post("/interop/{target}")
def interop(target: str, payload: Dict[str, Any] = Body(...)):
    return _drive(target, payload)


@app.get("/workflow/{workflow_id}")
def workflow_status(workflow_id: str):
    status = DBOS.get_workflow_status(workflow_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"no such workflow: {workflow_id}")
    return {
        "workflowId":         status.workflow_id,
        "name":               status.name,
        "status":             status.status,
        "queueName":          status.queue_name,
        "applicationName":    status.application_name,
        "applicationVersion": status.app_version,
        "parentWorkflowId":   status.parent_workflow_id,
    }


@app.get("/steps/{workflow_id}")
def workflow_steps(workflow_id: str):
    return [
        {
            "functionId":      step["function_id"],
            "functionName":    step["function_name"],
            "childWorkflowId": step["child_workflow_id"],
        }
        for step in DBOS.list_workflow_steps(workflow_id, load_output=False)
    ]


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
