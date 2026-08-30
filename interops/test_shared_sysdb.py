"""
Shared-system-database interop tests.

The four runtimes in this suite are four DBOS *applications* sharing one system
database. Each is identified by its configured name and owns what it creates —
its workflows, queues and application versions — running only its own work. They
still interoperate directly: every runtime enqueues the others' workflows from
inside its own workflows, with no DBOS client in between, naming the application
that owns the target workflow.

What the enqueue crossing an application boundary must not cost you:

  * the parent/child relationship — the enqueued workflow stays a child of the
    workflow that enqueued it, even though another application runs it;
  * addressability — workflow IDs are unique across the whole system database,
    so either application can read the same workflow's status by ID;
  * addressability of the schema itself — `dbosctl sysdb migrate` provisions the
    database all four meet on, so no one runtime's CLI owns the shared schema
    (see test_dbosctl.py).

    uv run pytest -s test_shared_sysdb.py

📖 https://docs.dbos.dev/explanations/sharing-a-system-database
"""

import time

import psycopg
import pytest
import requests

from conftest import (
    APP_NAMES,
    APP_VERSIONS,
    EXPECTED_ECHO,
    LANGUAGES,
    QUEUE_NAMES,
    SYS_DB_URL,
    TARGET_PAYLOADS,
    app_url,
    schema_snapshot,
)

# Every runtime enqueues through itself rather than a DBOS client, and so records
# a parent/child relationship across the application boundary. All four also
# claim what they run, so there is no longer an unowned corner of this database.
DRIVERS = LANGUAGES

PAIRS = [(s, t) for s in DRIVERS for t in LANGUAGES if s != t]
PAIR_IDS = [f"{s}To{t.title()}" for s, t in PAIRS]

# The columns that record ownership. Without them, applications sharing a system
# database could not tell their own workflows from their peers'.
OWNERSHIP_COLUMNS = [
    "workflow_status.application_name",
    "operation_outputs.application_name",
    "queues.application_name",
    "workflow_schedules.application_name",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _interop(source: str, target: str) -> dict:
    """Have `source` enqueue `target`'s echoWorkflow from inside a workflow."""
    resp = requests.post(
        f"{app_url(source)}/interop/{target}", json=TARGET_PAYLOADS[target], timeout=15
    )
    resp.raise_for_status()
    return resp.json()


def _workflow(app: str, workflow_id: str) -> dict:
    resp = requests.get(f"{app_url(app)}/workflow/{workflow_id}", timeout=15)
    resp.raise_for_status()
    return resp.json()


def _steps(app: str, workflow_id: str) -> list[dict]:
    resp = requests.get(f"{app_url(app)}/steps/{workflow_id}", timeout=15)
    resp.raise_for_status()
    return resp.json()


def _workflows(app: str, application_name: str | None = None) -> list[dict]:
    params = {} if application_name is None else {"application_name": application_name}
    resp = requests.get(f"{app_url(app)}/workflows", params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _enqueue_async(source: str, target: str, owner: str | None = None) -> str:
    """Enqueue onto `target`'s queue without waiting, optionally naming a
    different application as the owner. Returns the enqueued workflow's ID."""
    params = {} if owner is None else {"owner": owner}
    resp = requests.post(
        f"{app_url(source)}/enqueue-async/{target}",
        params=params,
        json=TARGET_PAYLOADS[target],
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["childId"]


def _wait_until_dequeued(app: str, workflow_id: str, timeout: int = 30) -> dict:
    """Block until a workflow leaves ENQUEUED — until some application took it."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = _workflow(app, workflow_id)
        if last["status"] != "ENQUEUED":
            return last
        time.sleep(0.5)
    raise AssertionError(f"{workflow_id} was never dequeued; last saw {last}")


# ---------------------------------------------------------------------------
# Parent/child relationships across applications
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("source,target", PAIRS, ids=PAIR_IDS)
def test_parent_child_preserved_across_applications(interop_apps, source: str, target: str):
    """A workflow enqueued from another application's runtime stays its child."""
    envelope = _interop(source, target)
    assert envelope["result"] == EXPECTED_ECHO

    parent_id, child_id = envelope["parentId"], envelope["childId"]
    assert parent_id, f"{source} did not run the enqueue inside a workflow"
    assert child_id and child_id != parent_id

    # The child records its parent even though a different application owns it.
    # Read it back through the *source* app: workflow IDs address the whole
    # system database, not just the rows one application owns.
    child = _workflow(source, child_id)
    assert child["parentWorkflowId"] == parent_id, (
        f"{source} -> {target}: child {child_id} lost its link to parent {parent_id}"
    )

    # These are evidence rather than an echo of the enqueue: every runtime here
    # is ownership-aware and overwrites both with its own as it claims the row.
    assert child["applicationName"] == APP_NAMES[target]
    assert child["applicationVersion"] == APP_VERSIONS[target]
    assert child["queueName"] == QUEUE_NAMES[target]
    assert child["status"] == "SUCCESS"

    # The parent stays with the application that ran it, and is nobody's child.
    parent = _workflow(source, parent_id)
    assert parent["applicationName"] == APP_NAMES[source]
    assert parent["parentWorkflowId"] is None


@pytest.mark.parametrize("source,target", PAIRS, ids=PAIR_IDS)
def test_cross_application_enqueue_is_a_step_of_the_parent(
    interop_apps, source: str, target: str
):
    """The enqueue is durably recorded as a step, so a replay does not redo it."""
    envelope = _interop(source, target)
    parent_id, child_id = envelope["parentId"], envelope["childId"]

    steps = _steps(source, parent_id)
    assert steps, f"{source} -> {target}: parent {parent_id} recorded no steps"
    assert child_id in [step["childWorkflowId"] for step in steps], (
        f"{source} -> {target}: no step of {parent_id} points at child {child_id}; "
        f"got {steps}"
    )


@pytest.mark.parametrize("source,target", PAIRS, ids=PAIR_IDS)
def test_both_applications_see_the_same_workflow(interop_apps, source: str, target: str):
    """Workflow IDs address the whole system database, not one application."""
    envelope = _interop(source, target)

    for workflow_id in (envelope["parentId"], envelope["childId"]):
        assert _workflow(source, workflow_id) == _workflow(target, workflow_id), (
            f"{source} and {target} disagree about workflow {workflow_id}"
        )


# ---------------------------------------------------------------------------
# Ownership
# ---------------------------------------------------------------------------

def test_all_four_applications_share_one_system_database(interop_apps):
    """The four runtimes are four applications in one database, not four databases.

    Every runtime claims the workflows it runs, so after driving one workflow
    into each of them, all four names appear as owners in the same tables.
    """
    children = {}
    for target in LANGUAGES:
        source = "typescript" if target == "python" else "python"
        children[target] = _interop(source, target)["childId"]

    with psycopg.connect(SYS_DB_URL) as conn:
        owners = {
            row[0]
            for row in conn.execute(
                "SELECT DISTINCT application_name FROM dbos.workflow_status"
            ).fetchall()
        }

        # Steps carry an owner of their own, so work is accounted to the
        # application that did it rather than the one that asked for it.
        step_owners = {
            target: {
                row[0]
                for row in conn.execute(
                    "SELECT DISTINCT application_name FROM dbos.operation_outputs"
                    " WHERE workflow_uuid = %s",
                    (child_id,),
                ).fetchall()
            }
            for target, child_id in children.items()
        }

    assert set(APP_NAMES.values()) <= owners, (
        f"not every application's workflows are in this system database: {owners}"
    )

    # No application is ever credited with another's work, and every runtime here
    # claims the steps it runs — an equality rather than a subset, which it could
    # not have been while an SDK that predated ownership left its steps unclaimed.
    for target, step_owner in step_owners.items():
        assert step_owner == {APP_NAMES[target]}, (
            f"{target}'s child workflow recorded steps owned by {step_owner}"
        )


def test_an_application_will_not_run_a_workflow_it_does_not_own(interop_apps):
    """Ownership gates dequeue by itself.

    The control and the subject are enqueued identically — same queue, same
    application version, same arguments — and differ only in who owns them. The
    control is owned by TypeScript, which polls that queue, and runs. The subject
    is owned by Python, which does not poll that queue, so nobody runs it: not
    TypeScript, which is polling the queue at a matching version but does not own
    the workflow, and not Python, which owns it but is not polling.
    """
    control_id = _enqueue_async("python", "typescript", owner="typescript")
    subject_id = _enqueue_async("python", "typescript", owner="python")

    # The control proves the enqueue is well-formed and that TypeScript is
    # actively draining this queue right now.
    control = _wait_until_dequeued("python", control_id)
    assert control["applicationName"] == APP_NAMES["typescript"]

    # Both landed on the same queue at the same version at the same moment, so by
    # the time TypeScript has taken the control it has had every chance at the
    # subject too.
    subject = _workflow("python", subject_id)
    assert subject["applicationName"] == APP_NAMES["python"]
    assert subject["status"] == "ENQUEUED", (
        "a workflow was dequeued by an application that does not own it"
    )


def test_workflow_listings_are_scoped_to_the_calling_application(interop_apps):
    """Listings show the caller's own workflows until they ask for a peer's."""
    envelope = _interop("python", "typescript")
    parent_id, child_id = envelope["parentId"], envelope["childId"]

    own = {row["workflowId"] for row in _workflows("python")}
    assert parent_id in own
    assert child_id not in own, (
        "Python's own listing leaked a workflow owned by interop-typescript"
    )

    peer = {row["workflowId"] for row in _workflows("python", APP_NAMES["typescript"])}
    assert child_id in peer, "Python could not list interop-typescript's workflows"


# ---------------------------------------------------------------------------
# The schema they share
# ---------------------------------------------------------------------------

def test_the_shared_schema_records_ownership(interop_apps):
    """The database the four meet on has somewhere to write an owner.

    Ownership is a property of the schema before it is a property of any
    runtime: without these columns the four applications here could not tell
    their own workflows, steps, queues and schedules from their peers'. The
    schema is provisioned by dbosctl rather than by any of their SDKs, which is
    what test_dbosctl.py is about; this is the part the rest of this file leans
    on.
    """
    snapshot = schema_snapshot(SYS_DB_URL)
    assert snapshot["version"], "the shared system database recorded no migration version"
    missing = [column for column in OWNERSHIP_COLUMNS if column not in snapshot["columns"]]
    assert not missing, f"the shared schema cannot record ownership: {missing} are absent"
