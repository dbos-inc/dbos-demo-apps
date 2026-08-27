"""
Pytest fixtures for the cross-language interop test suite.

Starts all four language runtimes as local sub-processes, each connected
to a shared Postgres system database. All build steps run automatically
as part of session setup — no manual pre-build required.

The four runtimes are four DBOS *applications* sharing one system database.
Each owns what it creates — its workflows, queues and application versions —
and runs only its own work, while still interoperating: an application can
enqueue another's workflows and wait for their results.

Each app is built against its *published* DBOS SDK as pinned in its own
manifest — except TypeScript, which is built from tip-of-main (cloned, built,
packed, and installed). Java resolves `dev.dbos:transact:+` and Go pins a
pseudo-version, both of which land on a prerelease: application-name ownership
and within-workflow enqueue lineage are published ahead of a tagged release.

The shared system-database schema is migrated by `dbosctl sysdb migrate`. The
system schema is shared by every DBOS SDK and dbosctl vendors the migrations,
so provisioning the database the four apps share does not mean picking one of
their SDKs and running its CLI.

Run the suites with:
    uv run pytest -s test_interops.py test_shared_sysdb.py test_dbosctl.py

Python/TypeScript/Go read DBOS_SYSTEM_DATABASE_URL; Java reads DBOS_SYSTEM_JDBC_URL.
"""

import os
import re
import shutil
import signal
import subprocess
import time
import urllib.parse as up
from pathlib import Path

import psycopg
import pytest
import requests

ROOT     = Path(__file__).parent
APPS_DIR = ROOT / "apps"

# The TypeScript SDK is built from tip-of-main rather than the published npm
# release: the published release can lag behind newer columns the other
# runtimes already expect (e.g. workflow_status.attributes).
TS_REPO_URL = "https://github.com/dbos-inc/dbos-transact-ts.git"
TS_SDK_SRC  = ROOT / ".ts-sdk-src"

# dbosctl migrates the shared system database. Pinned to a release: it is the
# tool under test in test_dbosctl.py, not a moving dependency, and `go install`
# fetches it from the module proxy without a checkout.
DBOSCTL_PKG     = "github.com/dbos-inc/dbos-ctl/cmd/dbosctl"
DBOSCTL_VERSION = "v0.10.1"
BIN_DIR         = ROOT / ".bin"
DBOSCTL         = BIN_DIR / "dbosctl"

SYS_DB_URL = os.environ.get(
    "DBOS_SYSTEM_DATABASE_URL",
    "postgresql://postgres:dbos@localhost:5432/interop_dbos_sys",
)

LANGUAGES = ["python", "typescript", "go", "java"]

PORTS = {
    "python":     8001,
    "typescript": 8002,
    "go":         8003,
    "java":       8004,
}

# Ports for apps launched against a system database of their own, by tests that
# need to empty or rename an application without disturbing the shared one.
PRIVATE_PORTS = {lang: port + 100 for lang, port in PORTS.items()}

# Each runtime is a separate DBOS application on the shared system database.
# Its name is what the system database records as the owner of every workflow,
# queue and application version it creates.
APP_NAMES = {lang: f"interop-{lang}" for lang in LANGUAGES}

# Application version names are unique across every application sharing a system
# database, so each runtime carries its own rather than a common "interop-v1".
APP_VERSIONS = {lang: f"{name}-v1" for lang, name in APP_NAMES.items()}

QUEUE_NAMES = {lang: f"interop-queue-{lang}" for lang in LANGUAGES}

# Echo workflow output, identical regardless of which runtime ran it.
EXPECTED_ECHO = {
    "echo_text":   "hello-interop",
    "echo_num":    42,
    "echo_float":  3.14,
    "items_count": 3,
    "echo_date":   "2025-01-15",
    "msg_date":    "2025-03-15",
}

# ---------------------------------------------------------------------------
# Per-target portable payloads.
#
# Each value is posted as the JSON body to POST /enqueue/{target} on the
# *source* runtime.  The source runtime relays it verbatim to the target
# application's echoWorkflow.  The format is chosen to match what each target
# runtime's workflow signature expects:
#
#   go         — single typed struct as positionalArgs[0]
#   python     — 3 positional args + 2 named kwargs (val_float, val_date)
#   typescript — 5 positional args (text, num, float, items, date)
#   java       — 5 positional args (text, num, float, items, date)
# ---------------------------------------------------------------------------
TARGET_PAYLOADS: dict = {
    "go": {
        "positionalArgs": [
            {"text": "hello-interop", "num": 42, "float": 3.14,
             "items": ["alpha", "beta", "gamma"], "date": "2025-01-15"},
        ],
        "namedArgs": {},
    },
    "python": {
        "positionalArgs": ["hello-interop", 42, ["alpha", "beta", "gamma"]],
        "namedArgs": {"val_float": 3.14, "val_date": "2025-01-15"},
    },
    "typescript": {
        "positionalArgs": ["hello-interop", 42, 3.14, ["alpha", "beta", "gamma"], "2025-01-15"],
        "namedArgs": {},
    },
    "java": {
        "positionalArgs": ["hello-interop", 42, 3.14, ["alpha", "beta", "gamma"], "2025-01-15"],
        "namedArgs": {},
    },
}


def app_url(lang: str, port: int | None = None) -> str:
    return f"http://localhost:{PORTS[lang] if port is None else port}"


# ---------------------------------------------------------------------------
# Build helpers — each app is built against its published DBOS SDK.
# ---------------------------------------------------------------------------

def _run(cmd: list[str], cwd: Path, env: dict | None = None) -> None:
    """Run a build command, streaming output; raises on non-zero exit."""
    print(f"\n[build] {' '.join(cmd)}  (cwd={cwd})")
    run_env = {**os.environ, **env} if env else None
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env=run_env)
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)
    if result.returncode != 0:
        raise RuntimeError(
            f"Build failed (exit {result.returncode}): {' '.join(cmd)}\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )


def _build_dbosctl() -> None:
    """Install the pinned dbosctl release into .bin.

    GOBIN rather than the caller's: the version this suite migrates and renames
    with should not depend on what happens to be on $PATH.
    """
    BIN_DIR.mkdir(exist_ok=True)
    _run(
        ["go", "install", f"{DBOSCTL_PKG}@{DBOSCTL_VERSION}"],
        ROOT,
        env={"GOBIN": str(BIN_DIR)},
    )


def _build_python() -> None:
    """Sync the test-runner environment, which also installs the published
    dbos/fastapi/uvicorn the interop-python app needs (see pyproject.toml)."""
    _run(["uv", "sync"], ROOT)


def _build_ts_sdk_tarball() -> Path:
    """Clone @dbos-inc/dbos-sdk at tip-of-main, build it, and `npm pack` it.

    Returns the path to the produced .tgz, which is installed into the
    interop-typescript app in place of the published release.
    """
    if (TS_SDK_SRC / ".git").exists():
        _run(["git", "fetch", "--depth", "1", "origin", "main"], TS_SDK_SRC)
        _run(["git", "reset", "--hard", "origin/main"], TS_SDK_SRC)
    else:
        if TS_SDK_SRC.exists():
            shutil.rmtree(TS_SDK_SRC)
        _run(["git", "clone", "--depth", "1", "--branch", "main", TS_REPO_URL, str(TS_SDK_SRC)], ROOT)

    _run(["npm", "install"], TS_SDK_SRC)
    _run(["npm", "run", "build"], TS_SDK_SRC)

    for stale in TS_SDK_SRC.glob("*.tgz"):
        stale.unlink()
    _run(["npm", "pack"], TS_SDK_SRC)

    tarballs = sorted(TS_SDK_SRC.glob("dbos-inc-dbos-sdk-*.tgz"))
    if not tarballs:
        raise RuntimeError("npm pack produced no @dbos-inc/dbos-sdk tarball")
    return tarballs[0]


def _build_typescript() -> None:
    app_dir = APPS_DIR / "interop-typescript"
    tarball = _build_ts_sdk_tarball()
    _run(["npm", "install"], app_dir)
    # Override the published SDK with the tip-of-main pack. --no-save leaves
    # the app's package.json untouched.
    _run(["npm", "install", str(tarball), "--no-save"], app_dir)
    _run(["npm", "run", "build"], app_dir)


def _build_go() -> None:
    app_dir = APPS_DIR / "interop-go"
    _run(["go", "build", "-o", "main", "."], app_dir)


def _build_java() -> None:
    _run(["./gradlew", "shadowJar"], APPS_DIR / "interop-java")


# ---------------------------------------------------------------------------
# Health / readiness helpers
# ---------------------------------------------------------------------------

def wait_healthy(lang: str, port: int | None = None, timeout: int = 60) -> None:
    url = f"{app_url(lang, port)}/healthz"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(1)
    raise TimeoutError(f"interop-{lang} did not become healthy within {timeout}s")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def _with_database(url: str, db_name: str) -> str:
    """`url` pointed at a different database on the same server."""
    return up.urlunparse(up.urlparse(url)._replace(path=f"/{db_name}"))


def sibling_database_url(suffix: str) -> str:
    """A URL for a throwaway database next to the shared system database.

    Used by tests that need a system database of their own — emptying or
    renaming an application without disturbing the shared four, for instance.
    """
    db_name = up.urlparse(SYS_DB_URL).path.lstrip("/")
    return _with_database(SYS_DB_URL, f"{db_name}_{suffix}")


def drop_database(url: str) -> None:
    """Drop the database `url` points at, if it is there."""
    db_name = up.urlparse(url).path.lstrip("/")
    with psycopg.connect(_with_database(url, "postgres"), connect_timeout=5, autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')


def recreate_database(url: str) -> None:
    """Drop and recreate the database `url` points at."""
    db_name = up.urlparse(url).path.lstrip("/")
    drop_database(url)
    with psycopg.connect(_with_database(url, "postgres"), connect_timeout=5, autocommit=True) as conn:
        conn.execute(f'CREATE DATABASE "{db_name}"')


def _wait_postgres(timeout: int = 30) -> None:
    """Block until postgres accepts connections, then drop+recreate the sys DB."""
    deadline = time.time() + timeout
    last_exc: Exception | None = None
    while time.time() < deadline:
        try:
            recreate_database(SYS_DB_URL)
            return
        except Exception as exc:
            last_exc = exc
            time.sleep(1)
    raise TimeoutError(f"Postgres not reachable within timeout: {last_exc}")


def schema_snapshot(url: str) -> dict:
    """The shape of the DBOS system schema in `url`.

    Its migration version, every table column, and the PL/pgSQL functions the
    runtimes call — enough to tell whether two runtimes migrated a database to
    the same place.
    """
    with psycopg.connect(url) as conn:
        version = conn.execute("SELECT version FROM dbos.dbos_migrations").fetchall()
        columns = conn.execute(
            """
            SELECT table_name || '.' || column_name
            FROM information_schema.columns
            WHERE table_schema = 'dbos'
            ORDER BY 1
            """
        ).fetchall()
        routines = conn.execute(
            """
            SELECT routine_name
            FROM information_schema.routines
            WHERE routine_schema = 'dbos'
            ORDER BY 1
            """
        ).fetchall()
    return {
        "version":  [row[0] for row in version],
        "columns":  [row[0] for row in columns],
        "routines": [row[0] for row in routines],
    }


# ---------------------------------------------------------------------------
# Schema migration
# ---------------------------------------------------------------------------

def dbosctl(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    """Run dbosctl, returning the completed process.

    stdout carries the result — migration progress, the counts a reset or a
    rename moved — and stderr the progress log, so tests read the two apart.
    """
    print(f"\n[dbosctl] {' '.join(args)}")
    result = subprocess.run(
        [str(DBOSCTL), *args], cwd=ROOT, capture_output=True, text=True
    )
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)
    if check and result.returncode != 0:
        raise RuntimeError(
            f"dbosctl {' '.join(args)} failed (exit {result.returncode})\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
    return result


def migrate(url: str) -> None:
    """Create or upgrade a DBOS system database.

    The four applications share one system database, and therefore one schema.
    dbosctl vendors the migrations the SDKs share, so the database they meet on
    is provisioned once, by a tool that is none of their runtimes — rather than
    by whichever application happened to launch first.
    """
    dbosctl("sysdb", "migrate", "-D", url)


# ---------------------------------------------------------------------------
# Port cleanup
# ---------------------------------------------------------------------------

def _kill_ports() -> None:
    """Kill any processes still bound to the interop ports (from a previous run).

    Best effort: this clears a previous run's leftovers, and a machine without
    lsof simply does not get that. The apps still fail to bind, loudly, if a
    port really is taken.
    """
    if shutil.which("lsof") is None:
        print("[ports] lsof not found; skipping cleanup of any leftover processes")
        return
    for port in (*PORTS.values(), *PRIVATE_PORTS.values()):
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"], capture_output=True, text=True
        )
        for pid in result.stdout.split():
            try:
                subprocess.run(["kill", "-9", pid], check=False)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Process launchers
# ---------------------------------------------------------------------------

def _postgres_to_jdbc(url: str) -> str:
    """Convert postgresql://user:pass@host:port/db  →  jdbc:postgresql://host:port/db."""
    u = up.urlparse(url)
    return f"jdbc:postgresql://{u.hostname}:{u.port or 5432}{u.path}"


def start_app(
    lang: str,
    sys_db_url: str = SYS_DB_URL,
    port: int | None = None,
    app_name: str | None = None,
) -> subprocess.Popen:
    """Launch one runtime.

    The database, port and application name are arguments rather than constants
    so a test can stand an application up on a system database of its own — to
    empty or rename it without disturbing the four the rest of the suite drives.

    `app_name` is honoured by the Java app alone, which is the one the rename
    test restarts under its new name; the others take the name they are
    configured with.
    """
    port = PORTS[lang] if port is None else port
    env = {**os.environ, "PORT": str(port)}
    if app_name is not None:
        env["INTEROP_APP_NAME"] = app_name

    if lang == "java":
        u = up.urlparse(sys_db_url)
        env |= {
            "DBOS_SYSTEM_JDBC_URL": _postgres_to_jdbc(sys_db_url),
            "PGUSER":      u.username or "postgres",
            "PGPASSWORD":  u.password or "dbos",
            "SERVER_PORT": str(port),
        }
    else:
        env["DBOS_SYSTEM_DATABASE_URL"] = sys_db_url

    commands = {
        "python":     ["uv", "run", "python", "main.py"],
        "typescript": ["node", "dist/main.js"],
        "go":         ["./main"],
        "java":       ["java", "-jar", "build/libs/interop-java-all.jar"],
    }
    return subprocess.Popen(commands[lang], cwd=APPS_DIR / f"interop-{lang}", env=env)


_BUILDERS = {
    "python":     _build_python,
    "typescript": _build_typescript,
    "go":         _build_go,
    "java":       _build_java,
}

def stop_app(proc: subprocess.Popen, timeout: int = 10) -> None:
    """Stop a launched runtime, hard if it will not go quietly.

    `dbosctl sysdb rename-application` says to stop the application being
    renamed first, and means it: nothing locks a running one out, and it goes
    on dequeuing under its old name.
    """
    proc.terminate()
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=timeout)


# ---------------------------------------------------------------------------
# Session fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def interop_builds():
    """Build all four language runtimes.

    Split out from `interop_apps` so tests that stand an application up on a
    system database of their own don't launch the shared four to do it.
    """
    _build_dbosctl()
    for lang in LANGUAGES:
        _BUILDERS[lang]()


@pytest.fixture(scope="session")
def interop_apps(interop_builds):
    """
    Session-scoped fixture.  Waits for Postgres, migrates the shared system
    database with dbosctl, starts the four processes, and tears them down
    after the session.
    """
    _wait_postgres()
    migrate(SYS_DB_URL)
    _kill_ports()

    procs: dict[str, subprocess.Popen] = {}

    def _teardown() -> None:
        for proc in procs.values():
            stop_app(proc)

    def _signal_handler(signum, frame):
        _teardown()
        signal.signal(signum, signal.SIG_DFL)
        os.kill(os.getpid(), signum)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    try:
        for lang in LANGUAGES:
            procs[lang] = start_app(lang)

        for lang in LANGUAGES:
            wait_healthy(lang)

        yield
    finally:
        _teardown()
