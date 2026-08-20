"""
Pytest fixtures for the cross-language interop test suite.

Starts all four language runtimes as local sub-processes, each connected
to a shared Postgres system database. All build steps run automatically
as part of session setup — no manual pre-build required.

The four runtimes are four DBOS *applications* sharing one system database.
Each owns what it creates — its workflows, queues and application versions —
and runs only its own work, while still interoperating: an application can
enqueue another's workflows and wait for their results.

Each app is built against its *published* DBOS SDK (PyPI, the Go module proxy,
Maven Central) as pinned in its own manifest — except TypeScript, which is
built from tip-of-main (cloned, built, packed, and installed), and Go, whose
manifest pins a tip-of-main pseudo-version until application-name ownership
and within-workflow enqueue lineage ship in a release. The shared
system-database schema is migrated by the Python, TypeScript and Go CLIs; the
TypeScript one ships inside the TypeScript SDK, and building TS from source
keeps that migration (and thus the schema all four apps share) current.

Run the suites with:
    uv run pytest -s test_interops.py test_shared_sysdb.py

Python/TypeScript/Go read DBOS_SYSTEM_DATABASE_URL; Java reads DBOS_SYSTEM_JDBC_URL.
"""

import os
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
# release: the `dbos schema` migration that provisions the shared system DB
# ships inside this SDK, and the published release can lag behind newer
# columns the other runtimes already expect (e.g. workflow_status.attributes).
TS_REPO_URL = "https://github.com/dbos-inc/dbos-transact-ts.git"
TS_SDK_SRC  = ROOT / ".ts-sdk-src"

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


def app_url(lang: str) -> str:
    return f"http://localhost:{PORTS[lang]}"


# Backwards-compatible private alias used within this module.
_app_url = app_url


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


def _build_python() -> None:
    """Sync the test-runner environment, which also installs the published
    dbos/fastapi/uvicorn the interop-python app needs (see pyproject.toml)."""
    _run(["uv", "sync"], ROOT)


def _build_ts_sdk_tarball() -> Path:
    """Clone @dbos-inc/dbos-sdk at tip-of-main, build it, and `npm pack` it.

    Returns the path to the produced .tgz. Installing this into the
    interop-typescript app upgrades both the runtime SDK and the bundled
    `dbos` CLI that migrate_typescript runs.
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
    # Override the published SDK with the tip-of-main pack. This also replaces
    # node_modules/.bin/dbos, so migrate_typescript's `npx dbos schema` runs the
    # current migration. --no-save leaves the app's package.json untouched.
    _run(["npm", "install", str(tarball), "--no-save"], app_dir)
    _run(["npm", "run", "build"], app_dir)


def _build_go() -> None:
    app_dir = APPS_DIR / "interop-go"
    _run(["go", "build", "-o", "main", "."], app_dir)


def _build_java() -> None:
    app_dir = APPS_DIR / "interop-java"
    _run(["./gradlew", "shadowJar"], app_dir)


# ---------------------------------------------------------------------------
# Health / readiness helpers
# ---------------------------------------------------------------------------

def _wait_healthy(lang: str, timeout: int = 60) -> None:
    url = f"{app_url(lang)}/healthz"
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

    Used by tests that need a system database of their own — checking that both
    runtimes migrate an empty database to the same schema, for instance.
    """
    db_name = up.urlparse(SYS_DB_URL).path.lstrip("/")
    return _with_database(SYS_DB_URL, f"{db_name}_{suffix}")


def recreate_database(url: str) -> None:
    """Drop and recreate the database `url` points at."""
    db_name = up.urlparse(url).path.lstrip("/")
    with psycopg.connect(_with_database(url, "postgres"), connect_timeout=5, autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
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

def migrate_python(url: str) -> None:
    """Migrate a system database with the Python runtime's CLI."""
    _run(["uv", "run", "dbos", "migrate", "-s", url], ROOT)


def migrate_typescript(url: str) -> None:
    """Migrate a system database with the TypeScript runtime's CLI.

    Uses the tip-of-main `dbos` CLI installed into interop-typescript by
    _build_typescript, not the published npm release."""
    _run(["npx", "dbos", "schema", url], APPS_DIR / "interop-typescript")


def migrate_go(url: str) -> None:
    """Migrate a system database with the Go runtime's CLI, at the SDK version
    interop-go pins. `go run pkg@version` ignores the local go.mod, which lacks
    go.sum entries for the CLI's own dependencies."""
    version = subprocess.run(
        ["go", "list", "-m", "-f", "{{.Version}}",
         "github.com/dbos-inc/dbos-transact-golang"],
        cwd=APPS_DIR / "interop-go", capture_output=True, text=True, check=True,
    ).stdout.strip()
    _run(
        ["go", "run", f"github.com/dbos-inc/dbos-transact-golang/cmd/dbos@{version}",
         "migrate", "--db-url", url],
        APPS_DIR / "interop-go",
    )


MIGRATORS = {
    "python":     migrate_python,
    "typescript": migrate_typescript,
    "go":         migrate_go,
}


def _migrate() -> None:
    """Migrate the shared system database with every migrating runtime's CLI.

    Applications sharing a system database share its schema, so their migrations
    have to compose: whichever runtime gets there first creates the schema, and
    the rest have to accept what they find. Running them all here does explicitly
    what the four apps would otherwise do implicitly at launch, and leaves the
    database on the newest schema any runtime knows about.
    """
    for migrate in MIGRATORS.values():
        migrate(SYS_DB_URL)


# ---------------------------------------------------------------------------
# Port cleanup
# ---------------------------------------------------------------------------

def _kill_ports() -> None:
    """Kill any processes still bound to the interop ports (from a previous run)."""
    for port in PORTS.values():
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

def _start_python() -> subprocess.Popen:
    env = {**os.environ, "DBOS_SYSTEM_DATABASE_URL": SYS_DB_URL, "PORT": str(PORTS["python"])}
    return subprocess.Popen(
        ["uv", "run", "python", "main.py"],
        cwd=APPS_DIR / "interop-python",
        env=env,
    )


def _start_typescript() -> subprocess.Popen:
    env = {**os.environ, "DBOS_SYSTEM_DATABASE_URL": SYS_DB_URL, "PORT": str(PORTS["typescript"])}
    return subprocess.Popen(
        ["node", "dist/main.js"],
        cwd=APPS_DIR / "interop-typescript",
        env=env,
    )


def _start_go() -> subprocess.Popen:
    env = {**os.environ, "DBOS_SYSTEM_DATABASE_URL": SYS_DB_URL, "PORT": str(PORTS["go"])}
    return subprocess.Popen(
        ["./main"],
        cwd=APPS_DIR / "interop-go",
        env=env,
    )


def _postgres_to_jdbc(url: str) -> str:
    """Convert postgresql://user:pass@host:port/db  →  jdbc:postgresql://host:port/db."""
    u = up.urlparse(url)
    return f"jdbc:postgresql://{u.hostname}:{u.port or 5432}{u.path}"


def _start_java() -> subprocess.Popen:
    app_dir = APPS_DIR / "interop-java"
    u = up.urlparse(SYS_DB_URL)
    env = {
        **os.environ,
        "DBOS_SYSTEM_JDBC_URL": _postgres_to_jdbc(SYS_DB_URL),
        "PGUSER":    u.username or "postgres",
        "PGPASSWORD": u.password or "dbos",
        "SERVER_PORT": str(PORTS["java"]),
    }
    return subprocess.Popen(
        ["java", "-jar", "build/libs/interop-java-all.jar"],
        cwd=app_dir,
        env=env,
    )


_BUILDERS = {
    "python":     _build_python,
    "typescript": _build_typescript,
    "go":         _build_go,
    "java":       _build_java,
}

_STARTERS = {
    "python":     _start_python,
    "typescript": _start_typescript,
    "go":         _start_go,
    "java":       _start_java,
}


# ---------------------------------------------------------------------------
# Session fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def interop_builds():
    """Build all four language runtimes.

    Split out from `interop_apps` so tests that only need a runtime's tooling —
    the migration CLIs, say — don't have to launch the apps.
    """
    for lang in LANGUAGES:
        _BUILDERS[lang]()


@pytest.fixture(scope="session")
def interop_apps(interop_builds):
    """
    Session-scoped fixture.  Waits for Postgres, migrates the shared system
    database with both runtimes' CLIs, starts the four processes, and tears
    them down after the session.
    """
    _wait_postgres()
    _migrate()
    _kill_ports()

    procs: dict[str, subprocess.Popen] = {}

    def _teardown() -> None:
        for lang, proc in procs.items():
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()

    def _signal_handler(signum, frame):
        _teardown()
        signal.signal(signum, signal.SIG_DFL)
        os.kill(os.getpid(), signum)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    try:
        for lang in LANGUAGES:
            procs[lang] = _STARTERS[lang]()

        for lang in LANGUAGES:
            _wait_healthy(lang)

        yield
    finally:
        _teardown()
