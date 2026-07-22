"""
DBOS Python interop app.

Registers echoWorkflow (class=interop, instance="default") on interop-queue-python.

Workflow signature (mix of positional and named args):
    positional: text (str), num (int), items (list[str])
    named:      val_float (float), val_date (str)

POST /enqueue/{target}  — accepts {positionalArgs, namedArgs} body, relays via
                          portable enqueue to interop-queue-{target}, returns result.
POST /debounce/{target} — accepts {first, final} payloads, debounces echoWorkflow
                          twice on one key so the calls coalesce, returns result.
GET  /healthz           — liveness probe.
"""

import os
from datetime import date as _date
from typing import Any, Dict, List

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi import Body

from dbos import DBOS, DBOSConfiguredInstance, DebouncerClient, Queue
from dbos._client import DBOSClient
from dbos._serialization import WorkflowSerializationFormat

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SYS_DB_URL = os.environ["DBOS_SYSTEM_DATABASE_URL"]
PORT       = int(os.environ.get("PORT", 8001))

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
DBOS(fastapi=app, config={"name": "interop-python", "system_database_url": SYS_DB_URL, "application_version": "interop-v1"})

_queue = Queue("interop-queue-python")

# Client reused across requests (created after DBOS.launch() in startup)
_client: DBOSClient = None  # type: ignore[assignment]


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

# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def _startup() -> None:
    global _client
    # Only serve our own queue: database-backed queues (e.g. the Go app's) are
    # visible to every worker on the shared system database.
    DBOS.listen_queues(["interop-queue-python"])
    DBOS.launch()
    _client = DBOSClient(system_database_url=SYS_DB_URL)


@app.on_event("shutdown")
async def _shutdown() -> None:
    if _client:
        _client.destroy()


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/enqueue/{target}")
async def enqueue(target: str, payload: Dict[str, Any] = Body(...)):
    if target not in QUEUE_NAMES:
        raise HTTPException(status_code=400, detail=f"unknown target: {target!r}")

    pos   = payload.get("positionalArgs", [])
    named = payload.get("namedArgs", {})

    handle = await _client.enqueue_async(
        {
            "queue_name":        QUEUE_NAMES[target],
            "workflow_name":     "echoWorkflow",
            "class_name":        "interop",
            "instance_name":     "default",
            "serialization_type": WorkflowSerializationFormat.PORTABLE,
        },
        *pos,
        **named,
    )

    # Send a date message to the enqueued workflow using portable serialisation.
    # send_async doesn't forward serialization_type, so use the sync send.
    _client.send(
        handle.get_workflow_id(),
        _date(2025, 3, 15),
        "date-msg",
        serialization_type=WorkflowSerializationFormat.PORTABLE,
    )

    return await handle.get_result()


@app.post("/debounce/{target}")
def debounce(target: str, payload: Dict[str, Any] = Body(...)):
    """Debounce echoWorkflow on interop-queue-{target} twice with one key.

    The body carries two {positionalArgs, namedArgs} payloads: "first" is
    submitted with a long debounce period, then "final" replaces it with a
    short one. Both calls must coalesce on a single workflow that runs with
    the final payload.
    """
    if target not in QUEUE_NAMES:
        raise HTTPException(status_code=400, detail=f"unknown target: {target!r}")

    first, final = payload["first"], payload["final"]
    key = f"interop-python-{target}"

    debouncer = DebouncerClient(
        _client,
        {
            "queue_name":         QUEUE_NAMES[target],
            "workflow_name":      "echoWorkflow",
            "class_name":         "interop",
            "instance_name":      "default",
            "serialization_type": WorkflowSerializationFormat.PORTABLE,
        },
    )
    h1 = debouncer.debounce(
        key, 10.0, *first.get("positionalArgs", []), **first.get("namedArgs", {})
    )
    h2 = debouncer.debounce(
        key, 1.0, *final.get("positionalArgs", []), **final.get("namedArgs", {})
    )

    # Send the date message to the (single) coalesced workflow.
    _client.send(
        h2.get_workflow_id(),
        _date(2025, 3, 15),
        "date-msg",
        serialization_type=WorkflowSerializationFormat.PORTABLE,
    )

    return {
        "coalesced": h1.get_workflow_id() == h2.get_workflow_id(),
        "result": h2.get_result(),
    }


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
