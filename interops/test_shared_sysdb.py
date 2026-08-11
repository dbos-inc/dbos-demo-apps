"""
Shared-system-database interop tests.

The four runtimes in this suite are four DBOS *applications* sharing one system
database. Each is identified by its configured name and owns what it creates —
its workflows, queues and application versions — running only its own work. They
still interoperate directly: the Python and TypeScript runtimes enqueue each
other's workflows from inside their own workflows, with no DBOS client in
between, naming the application that owns the target workflow.

What the enqueue crossing an application boundary must not cost you:

  * the parent/child relationship — the enqueued workflow stays a child of the
    workflow that enqueued it, even though another application runs it;
  * addressability — workflow IDs are unique across the whole system database,
    so either application can read the same workflow's status by ID;
  * a common schema — either runtime can migrate the shared database, and both
    have to agree on what they migrate it to.

    uv run pytest -s test_shared_sysdb.py

📖 https://docs.dbos.dev/explanations/sharing-a-system-database
"""

import pytest
import requests

from conftest import (
    APP_NAMES,
    APP_VERSIONS,
    EXPECTED_ECHO,
    LANGUAGES,
    MIGRATORS,
    QUEUE_NAMES,
    TARGET_PAYLOADS,
    app_url,
    recreate_database,
    schema_snapshot,
    sibling_database_url,
)

# The runtimes that enqueue through their own runtime rather than a DBOS client,
# and so record a parent/child relationship across the application boundary.
DRIVERS = ["python", "typescript"]

PAIRS = [(s, t) for s in DRIVERS for t in LANGUAGES if s != t]
PAIR_IDS = [f"{s}To{t.title()}" for s, t in PAIRS]

# The pairs whose target also exposes the introspection endpoints below.
BOTH_WAYS = [(s, t) for s, t in PAIRS if t in DRIVERS]
BOTH_WAYS_IDS = [f"{s}To{t.title()}" for s, t in BOTH_WAYS]

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

    # Ownership was handed to the target, which is why the target ran it: an
    # enqueued workflow is only dequeued by an executor at the version named
    # here, and only the target application is deployed at that version.
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


@pytest.mark.parametrize("source,target", BOTH_WAYS, ids=BOTH_WAYS_IDS)
def test_both_applications_see_the_same_workflow(interop_apps, source: str, target: str):
    """Workflow IDs address the whole system database, not one application."""
    envelope = _interop(source, target)

    for workflow_id in (envelope["parentId"], envelope["childId"]):
        assert _workflow(source, workflow_id) == _workflow(target, workflow_id), (
            f"{source} and {target} disagree about workflow {workflow_id}"
        )


# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------

def test_migrations_from_either_runtime_agree(interop_builds):
    """Both runtimes migrate a shared system database to the same schema.

    Whichever application reaches a shared system database first migrates it,
    and the others have to accept what they find — so the order the runtimes
    migrate in must not change where the database ends up.
    """
    finals = {}
    for order in [("python", "typescript"), ("typescript", "python")]:
        url = sibling_database_url("_".join(order))
        recreate_database(url)

        MIGRATORS[order[0]](url)
        first = schema_snapshot(url)
        # A runtime that has never seen this database migrates it on top of
        # whatever the first one left behind.
        MIGRATORS[order[1]](url)
        finals[order] = schema_snapshot(url)

        assert first["version"], f"{order[0]} recorded no migration version"
        assert finals[order]["version"] >= first["version"], (
            f"{order[1]} rolled the schema back from under {order[0]}"
        )
        # Either runtime alone must be able to bootstrap a database the others
        # will join, so each has to know about ownership on its own.
        for column in OWNERSHIP_COLUMNS:
            assert column in first["columns"], (
                f"{order[0]} alone did not create {column}"
            )

    forward = finals[("python", "typescript")]
    reverse = finals[("typescript", "python")]
    assert forward == reverse, (
        "the runtimes migrate a shared system database to different schemas "
        "depending on which one goes first"
    )
