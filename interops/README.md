# DBOS Cross-Language Interops

Four tiny apps — Python, TypeScript, Go, Java — that enqueue the *same* DBOS
workflow to each other across language boundaries, all sharing one system database.

They demonstrate two DBOS features together:

- **Portable workflows** — a workflow registered in one runtime can be enqueued,
  messaged, and awaited from another, because arguments and results are serialized
  in a language-neutral format.
  📖 <https://docs.dbos.dev/explanations/portable-workflows>
- **Sharing a system database** — the four runtimes are four DBOS *applications* on
  one database. Each owns what it creates and runs only its own work, but they
  interoperate by naming each other.
  📖 <https://docs.dbos.dev/explanations/sharing-a-system-database>

The database they share is created, and maintained, with `dbosctl` — which is
none of their runtimes. See [Provisioning the shared database](#provisioning-the-shared-database).

## How it works

Every app registers the same workflow contract: name `echoWorkflow`, class/instance
`interop`/`default`, queue `interop-queue-{language}`, serialization `portable`.
`echoWorkflow` echoes its args, waits for a `date-msg` (`DBOS.recv`), and returns the
same JSON from every runtime:

```json
{"echo_text": "hello-interop", "echo_num": 42, "echo_float": 3.14,
 "items_count": 3, "echo_date": "2025-01-15", "msg_date": "2025-03-15"}
```

Each app also exposes `POST /enqueue/{target}`, which enqueues `echoWorkflow`
onto `interop-queue-{target}`, sends it a date message, and returns the result. So
`POST localhost:8001/enqueue/go` = *"Python enqueues Go's workflow."* Four runtimes →
12 directed pairs, every language driving every other.

```
apps/
├── interop-python/      # FastAPI  :8001
├── interop-typescript/  # Express  :8002
├── interop-go/          # net/http :8003
└── interop-java/        # Javalin  :8004
```

Each `echoWorkflow` has a different native signature (Go takes one typed struct;
Python mixes positional/keyword args; TS/Java take five positional args). Portable
serialization maps the caller's `{positionalArgs, namedArgs}` envelope onto it.

## Sharing one system database

Each app is a distinct application, named by the `name` in its config
(`interop-python`, `interop-typescript`, …). The system database records that name
as the owner of every workflow, queue and application version the app creates, and
an application runs only its own work. Two things follow that are visible in the
code here:

- **Version names are globally unique** across a shared system database, so each app
  carries its own `interop-{language}-v1` rather than a common `interop-v1`. An
  enqueue names the version of the runtime that will run the workflow.
- **Every app enqueues from inside a workflow**, through its own runtime rather than
  a `DBOSClient` — `enqueue_workflow_with_options` in Python,
  `enqueueWorkflowWithOptionsPortable` in TypeScript, `dbos.Enqueue` in Go,
  `DBOS.enqueuePortableWorkflow` in Java — naming the target application. The
  enqueued workflow is owned and run by the target but stays a **child of the
  enqueuing workflow**: the relationship survives the application boundary.
- Each app still restricts itself to its own queue with `listenQueues`. Ownership
  gates dequeue on its own, and the suite proves that; `listenQueues` says the
  same thing on the polling side, and keeps three runtimes off a queue only one
  of them serves.

Every app answers `POST /enqueue/{target}`, `POST /interop/{target}`,
`GET /workflow/{id}` and `GET /steps/{id}`. Python, TypeScript and Java expose two
more, which is what the shared-database tests drive:

| Endpoint | Purpose |
| --- | --- |
| `POST /enqueue-async/{target}?owner=` | Enqueue without waiting, optionally handing ownership to an application that isn't polling that queue. |
| `GET /workflows?application_name=` | Workflows this application owns, or a named peer's. |

Workflow IDs are unique across the whole system database, so `GET /workflow/{id}`
answers for workflows any application owns. Listings, by contrast, are scoped to
the calling application unless they name a peer.

A runtime stamps its own name and version onto a workflow row as it claims it, so a
completed workflow's `applicationName` names whoever actually ran it rather than
echoing what the enqueuer asked for — and the steps it recorded carry the same
name. All four runtimes here do that, so there is no unowned corner of this
database left: every row names the application that made it.

## Run it

Prereqs: PostgreSQL on `localhost:5432`, `dbosctl` to provision it, plus the
toolchains for the apps you run (Python 3.11+, Node.js, Go 1.26+, JDK 21).

Start Postgres (creates the shared `interop_dbos_sys` database):

```bash
docker compose up -d
SYS_DB_URL=postgresql://postgres:dbos@localhost:5432/interop_dbos_sys
```

Migrate the shared schema with `dbosctl` (see
[Provisioning the shared database](#provisioning-the-shared-database)):

```bash
go install github.com/dbos-inc/dbos-ctl/cmd/dbosctl@v0.10.1
dbosctl sysdb migrate -D $SYS_DB_URL
```

Run each app in its own terminal:

```bash
# Python (:8001)
cd apps/interop-python && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DBOS_SYSTEM_DATABASE_URL=$SYS_DB_URL PORT=8001 python main.py

# TypeScript (:8002)
cd apps/interop-typescript && npm install && npm run build
DBOS_SYSTEM_DATABASE_URL=$SYS_DB_URL PORT=8002 npm start

# Go (:8003)
cd apps/interop-go && go build -o main .
DBOS_SYSTEM_DATABASE_URL=$SYS_DB_URL PORT=8003 ./main

# Java (:8004)
cd apps/interop-java && ./gradlew shadowJar
DBOS_SYSTEM_JDBC_URL=jdbc:postgresql://localhost:5432/interop_dbos_sys \
  PGUSER=postgres PGPASSWORD=dbos SERVER_PORT=8004 \
  java -jar build/libs/interop-java-all.jar
```

Have Python enqueue the Go workflow:

```bash
curl -s localhost:8001/enqueue/go -H 'content-type: application/json' \
  -d '{"positionalArgs":[{"text":"hello-interop","num":42,"float":3.14,"items":["alpha","beta","gamma"],"date":"2025-01-15"}],"namedArgs":{}}'
```

Or ask Python for the parent/child linkage as well:

```bash
curl -s localhost:8001/interop/typescript -H 'content-type: application/json' \
  -d '{"positionalArgs":["hello-interop",42,3.14,["alpha","beta","gamma"],"2025-01-15"],"namedArgs":{}}'
# {"result": {...}, "parentId": "...", "childId": "..."}
curl -s localhost:8001/workflow/$CHILD_ID
# {"applicationName": "interop-typescript", "parentWorkflowId": "$PARENT_ID", ...}
```

The payload shape matches the **target** language's signature — see `TARGET_PAYLOADS`
in `conftest.py`. To run everything, just start Postgres (`docker compose up -d`) and:

```bash
uv run pytest -s test_interops.py test_shared_sysdb.py test_dbosctl.py
```

- `test_interops.py` — all 12 cross-language enqueue pairs.
- `test_shared_sysdb.py` — that parent/child relationships survive the application
  boundary; that all four applications really do live in one database; that an
  application will not run a workflow it does not own, even when it is polling that
  queue at that version; and that listings are scoped to the caller.
- `test_dbosctl.py` — that `dbosctl` provisions the database the four meet on, and
  maintains it afterwards: emptying one application's rows without touching its
  peer's, and handing a renamed application its own history back.

The `interop_builds` and `interop_apps` fixtures in `conftest.py` build all four apps,
migrate the system database with `dbosctl`, launch the apps as subprocesses, wait
for their health checks, and tear everything down — no manual per-app startup
required.

## Provisioning the shared database

Four applications sharing a system database share one schema, so something has to
create it before any of them launches. Every DBOS SDK ships a CLI that can, and any
of them would do — which is the problem: the schema belongs to none of these four
languages, and picking one makes the other three depend on its toolchain to stand
the demo up. [`dbosctl`](https://github.com/dbos-inc/dbos-ctl) vendors the
migrations the SDKs share, so it provisions the database as none of the runtimes:

```bash
dbosctl sysdb migrate -D $SYS_DB_URL      # create or upgrade; safe to re-run
```

Two more commands matter once several applications are on one database, because
both are scoped to the application you name rather than to the database:

```bash
# Empty one application's rows. Its peers, and the migrated schema, are left alone.
dbosctl sysdb reset -D $SYS_DB_URL --app interop-python

# Hand a renamed application its history. Stop it first — nothing locks it out.
dbosctl sysdb rename-application -D $SYS_DB_URL --from interop-java --to interop-java-renamed
```

An application owns its rows by its configured name, so renaming it strands them:
it comes back up a stranger to its own workflows, queues and versions.
`rename-application` moves them, and `test_dbosctl.py` proves it with the
application itself — restarted under the new name, its own listing has the
workflows it ran under the old one. (`interop-java` reads `INTEROP_APP_NAME` so
that test can restart it as the application it now is; the other three take the
name they are configured with.)

Both commands refuse a schema migrated past what the binary knows, rather than
silently skipping a table they have never heard of — so a database newer than your
`dbosctl` is a prompt to upgrade it.

## SDK versions

> **Temporary:** the Java app is pinned to a local
> `./gradlew :transact:publishToMavenLocal` build of dbos-transact-java's
> `skip-unrecognized-serialization` branch, which fixes two bugs this demo hit — a
> status read throwing on a peer application's payload, and on the empty error
> column the Go SDK writes for a successful workflow. Drop that commit and restore
> `dev.dbos:transact:+` once those are released.


`interop-java` needs application names and `DBOS.enqueuePortableWorkflow`, and
`interop-go` needs the same; both landed after those SDKs' latest tagged
releases. Neither app builds from source for it — every build of an SDK's main
branch is published, so Java resolves `dev.dbos:transact:+` (Gradle's `+` is the
latest version published, prereleases included) and Go pins the matching
pseudo-version. TypeScript is the exception and is still built from tip-of-main:
`conftest.py` clones it, builds it, packs it, and installs it over the published
release.
