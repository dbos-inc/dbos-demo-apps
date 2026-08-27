"""
Provisioning and maintaining the system database the four applications share.

The four runtimes here are four DBOS applications on one system database, and
that database has to be created, occasionally emptied, and — when an
application is renamed — re-owned. `dbosctl` does all three without being one
of their runtimes: the system schema is shared by every DBOS SDK, and dbosctl
vendors the migrations, so the database four languages meet on is not
provisioned by whichever language got there first.

  * `sysdb migrate` creates the database and schema and applies what they lack.
    It is what conftest runs before the four apps launch.
  * `sysdb reset --app` empties one application's rows in a shared database,
    leaving its peers — and the migrated schema — alone.
  * `sysdb rename-application` moves the rows an application owns to its new
    name, so a renamed application still finds its own history.

The last two mutate a whole application's rows, so each runs against a system
database of its own with its own app processes, rather than the shared one the
other suites are driving.

    uv run pytest -s test_dbosctl.py

📖 https://docs.dbos.dev/explanations/sharing-a-system-database
"""

import json

import psycopg
import pytest
import requests

from conftest import (
    APP_NAMES,
    APP_VERSIONS,
    EXPECTED_ECHO,
    PRIVATE_PORTS,
    TARGET_PAYLOADS,
    app_url,
    dbosctl,
    drop_database,
    migrate,
    recreate_database,
    schema_snapshot,
    sibling_database_url,
    start_app,
    stop_app,
    wait_healthy,
)

# The application that is renamed gets a java app of its own, so it can be
# stopped and restarted under a new name without touching the pair the reset
# test is driving.
RENAME_PORT = PRIVATE_PORTS["java"] + 10

# The owner-carrying tables these apps reach. `workflow_schedules` carries an
# owner too, and both commands work through it, but nothing here registers a
# schedule. Everything else in the schema is keyed by a workflow and follows
# its workflow.
OWNED_TABLES = [
    "workflow_status",
    "operation_outputs",
    "queues",
    "application_versions",
]

# The subset these apps actually put rows in. `dbos.queues` holds *dynamic*
# queues, and all four apps declare theirs statically — the queue lives in the
# app's own registry rather than the database — so that table stays empty here.
# Ownership still has to be right for the rows there are, which is what the
# counts above compare; this is the subset a test may require to be non-empty.
POPULATED_TABLES = ["workflow_status", "operation_outputs", "application_versions"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _owned_counts(url: str, application_name: str) -> dict[str, int]:
    """How many rows in each owned table name `application_name`."""
    with psycopg.connect(url) as conn:
        return {
            table: conn.execute(
                f"SELECT count(*) FROM dbos.{table} WHERE application_name = %s",
                (application_name,),
            ).fetchone()[0]
            for table in OWNED_TABLES
        }


def _interop(port: int, source: str, target: str) -> dict:
    """Have the app on `port` enqueue `target`'s echoWorkflow from a workflow."""
    resp = requests.post(
        f"{app_url(source, port)}/interop/{target}",
        json=TARGET_PAYLOADS[target],
        timeout=30,
    )
    resp.raise_for_status()
    envelope = resp.json()
    assert envelope["result"] == EXPECTED_ECHO
    return envelope


def _workflow_ids(port: int, lang: str, application_name: str | None = None) -> set[str]:
    params = {} if application_name is None else {"application_name": application_name}
    resp = requests.get(f"{app_url(lang, port)}/workflows", params=params, timeout=30)
    resp.raise_for_status()
    return {row["workflowId"] for row in resp.json()}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def reset_apps(interop_builds):
    """Two applications — Python and Java — on a system database of their own.

    Two, because emptying one application's rows is only interesting next to a
    peer that keeps its own: a reset that took the whole database would need no
    second application to prove it.
    """
    url = sibling_database_url("reset")
    recreate_database(url)
    migrate(url)

    procs = {
        lang: start_app(lang, sys_db_url=url, port=PRIVATE_PORTS[lang])
        for lang in ("python", "java")
    }
    try:
        for lang in procs:
            wait_healthy(lang, PRIVATE_PORTS[lang])
        yield url, procs
    finally:
        for proc in procs.values():
            stop_app(proc)


@pytest.fixture
def rename_app(interop_builds):
    """One Java application, on a system database of its own, under its own name.

    Yields the database URL and a launcher, so the test can stop the
    application, rename it, and start it again as the application it now is.
    """
    url = sibling_database_url("rename")
    recreate_database(url)
    migrate(url)

    running: list = []

    def launch(app_name: str):
        proc = start_app("java", sys_db_url=url, port=RENAME_PORT, app_name=app_name)
        running.append(proc)
        wait_healthy("java", RENAME_PORT)
        return proc

    try:
        yield url, launch
    finally:
        for proc in running:
            stop_app(proc)


# ---------------------------------------------------------------------------
# sysdb migrate
# ---------------------------------------------------------------------------

def test_migrate_provisions_a_database_that_records_ownership(interop_builds):
    """dbosctl alone takes an empty server to a schema the four apps can share.

    Not just any schema: applications sharing a system database are told apart
    by name, so the columns that record an owner have to be there before the
    first of them launches.
    """
    url = sibling_database_url("migrate")
    recreate_database(url)

    migrate(url)
    snapshot = schema_snapshot(url)

    assert snapshot["version"], "migrate recorded no migration version"
    for table in OWNED_TABLES:
        assert f"{table}.application_name" in snapshot["columns"], (
            f"migrate left {table} with nowhere to record an owner"
        )


def test_migrate_is_safe_to_re_run(interop_builds):
    """An up-to-date database is left alone.

    Applications sharing a system database also share its migrations, so the
    second, third and fourth arrivals run into a database that is already
    migrated. That has to be uneventful rather than an error or a rewrite.
    """
    url = sibling_database_url("migrate_again")
    recreate_database(url)

    migrate(url)
    first = schema_snapshot(url)
    migrate(url)

    assert schema_snapshot(url) == first, "re-running migrate changed the schema"


def test_migrate_creates_a_database_that_is_not_there(interop_builds):
    """The database itself, not only the schema — there is nothing to create it
    first on a server that has never held one."""
    url = sibling_database_url("absent")
    drop_database(url)

    migrate(url)

    assert schema_snapshot(url)["version"], "migrate did not provision the missing database"


# ---------------------------------------------------------------------------
# sysdb reset
# ---------------------------------------------------------------------------

def test_reset_empties_one_application_and_leaves_its_peer(reset_apps):
    """`--app` is scoped to the application it names.

    Both applications drive work into the database, so both own workflows,
    steps, a queue and a version. Emptying one takes all four kinds of row and
    leaves the other's untouched — which is what makes a reset usable on a
    database an application does not have to itself.
    """
    url, procs = reset_apps

    _interop(PRIVATE_PORTS["python"], "python", "java")
    _interop(PRIVATE_PORTS["java"], "java", "python")

    before = {name: _owned_counts(url, name) for name in (APP_NAMES["python"], APP_NAMES["java"])}
    for name, counts in before.items():
        assert all(counts[table] for table in POPULATED_TABLES), (
            f"{name} does not own the rows this test is about: {counts}"
        )

    # Stop the application whose history is going: nothing here locks a running
    # one out, and it would go on writing rows under the name being emptied.
    stop_app(procs.pop("python"))

    result = dbosctl(
        "sysdb", "reset", "-D", url, "--app", APP_NAMES["python"], "--force", "-o", "json"
    )
    emptied = {row["table"]: row["rows"] for row in json.loads(result.stdout)}
    assert emptied["workflow_status"] == before[APP_NAMES["python"]]["workflow_status"], (
        f"reset reported emptying {emptied} of {before[APP_NAMES['python']]}"
    )

    after = {name: _owned_counts(url, name) for name in before}
    assert after[APP_NAMES["python"]] == dict.fromkeys(OWNED_TABLES, 0), (
        f"reset left rows behind under {APP_NAMES['python']}: {after[APP_NAMES['python']]}"
    )
    assert after[APP_NAMES["java"]] == before[APP_NAMES["java"]], (
        "reset took rows belonging to an application it was not asked about"
    )

    # The schema is left migrated and immediately usable rather than dropped, so
    # the peer that was never asked about is still running on it.
    assert schema_snapshot(url)["version"], "reset rolled the schema back"
    wait_healthy("java", PRIVATE_PORTS["java"])
    assert _workflow_ids(PRIVATE_PORTS["java"], "java"), (
        "the peer application lost its own workflows to another's reset"
    )


# ---------------------------------------------------------------------------
# sysdb rename-application
# ---------------------------------------------------------------------------

def test_rename_application_hands_an_applications_history_to_its_new_name(rename_app):
    """A renamed application still owns what it created under its old name.

    An application owns its rows by its configured name, so renaming it strands
    them: it comes back up as a stranger to its own history. This moves them,
    and the proof is the application itself — restarted under the new name, its
    own listing has the workflows it ran before the rename.
    """
    url, launch = rename_app
    old_name, new_name = APP_NAMES["java"], "interop-java-renamed"

    proc = launch(old_name)
    envelope = _interop(RENAME_PORT, "java", "java")
    ran_before = {envelope["parentId"], envelope["childId"]}
    assert ran_before <= _workflow_ids(RENAME_PORT, "java")

    before = _owned_counts(url, old_name)
    assert all(before[table] for table in POPULATED_TABLES), (
        f"the application owns nothing to move: {before}"
    )

    # Stop it first, as the command says to: nothing locks a running application
    # out, and it would keep dequeuing under the name being moved away from.
    stop_app(proc)

    result = dbosctl(
        "sysdb", "rename-application", "-D", url,
        "--from", old_name, "--to", new_name, "--force", "-o", "json",
    )
    moved = json.loads(result.stdout)
    assert moved["workflows"] == before["workflow_status"]
    assert moved["steps"] == before["operation_outputs"]
    assert moved["queues"] == before["queues"]
    assert moved["versions"] == before["application_versions"]

    assert _owned_counts(url, old_name) == dict.fromkeys(OWNED_TABLES, 0), (
        f"rows were left behind under {old_name}"
    )
    assert _owned_counts(url, new_name) == before, (
        f"{new_name} did not end up owning what {old_name} owned"
    )

    # The application version keeps its name and changes hands with everything
    # else, so the restarted application registers the version it already has
    # rather than colliding with a version that is now owned by a name it does
    # not answer to.
    with psycopg.connect(url) as conn:
        owner = conn.execute(
            "SELECT application_name FROM dbos.application_versions WHERE version_name = %s",
            (APP_VERSIONS["java"],),
        ).fetchone()
    assert owner[0] == new_name

    # The payoff: the same application, under the name it now has, listing the
    # work it did under the name it had.
    launch(new_name)
    assert ran_before <= _workflow_ids(RENAME_PORT, "java"), (
        f"{new_name} cannot see the workflows it ran as {old_name}"
    )
