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
- **Python and TypeScript enqueue from inside a workflow**, through the runtime's
  own `enqueueWorkflowWithOptions` rather than a `DBOSClient`, naming the target
  application. The enqueued workflow is owned and run by the target but stays a
  **child of the enqueuing workflow** — the relationship survives the application
  boundary. Go and Java still enqueue through their clients; their SDKs don't claim
  ownership yet, which is also why every app still restricts itself to its own queue
  with `listenQueues` (an unowned queue is polled by every application).

Python and TypeScript expose a little more of this:

| Endpoint | Purpose |
| --- | --- |
| `POST /enqueue/{target}` | Enqueue `{target}`'s `echoWorkflow`; return its result. |
| `POST /interop/{target}` | The same call, returning `{result, parentId, childId}`. |
| `POST /enqueue-async/{target}?owner=` | Enqueue without waiting, optionally handing ownership to an application that isn't polling that queue. |
| `GET /workflow/{id}` | Any workflow's status, with its owning application and parent. |
| `GET /steps/{id}` | A workflow's recorded steps, with child workflow IDs. |
| `GET /workflows?application_name=` | Workflows this application owns, or a named peer's. |

Workflow IDs are unique across the whole system database, so `GET /workflow/{id}`
answers for workflows either application owns. Listings, by contrast, are scoped to
the calling application unless they name a peer.

An ownership-aware runtime stamps its own name and version onto a workflow row as it
claims it, so for Python and TypeScript a completed workflow's `applicationName`
names whoever actually ran it rather than echoing what the enqueuer asked for. The
Go and Java SDKs pinned here predate ownership: they neither claim the workflows
they dequeue nor stamp the steps they run, so those rows keep whatever the enqueuer
set — `NULL` when the enqueuer was Go or Java. That's the "unowned rows" case, and
it's why every app still restricts itself to its own queue.

## Run it

Prereqs: PostgreSQL on `localhost:5432`, plus the toolchains for the apps you run
(Python 3.11+, Node.js, Go 1.26+, JDK 21).

Start Postgres (creates the shared `interop_dbos_sys` database):

```bash
docker compose up -d
SYS_DB_URL=postgresql://postgres:dbos@localhost:5432/interop_dbos_sys
```

Either runtime can migrate the shared schema, and applications also migrate on
launch:

```bash
uv run dbos migrate -s $SYS_DB_URL                       # Python CLI
(cd apps/interop-typescript && npx dbos schema $SYS_DB_URL)  # TypeScript CLI
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
uv run pytest -s test_interops.py test_shared_sysdb.py
```

- `test_interops.py` — all 12 cross-language enqueue pairs.
- `test_shared_sysdb.py` — that parent/child relationships survive the application
  boundary; that all four applications really do live in one database; that an
  application will not run a workflow it does not own, even when it is polling that
  queue at that version; that listings are scoped to the caller; and that Python and
  TypeScript migrate a shared system database to the same schema in either order.

The `interop_builds` and `interop_apps` fixtures in `conftest.py` build all four apps,
migrate the system database with both runtimes' CLIs, launch the apps as subprocesses,
wait for their health checks, and tear everything down — no manual per-app startup
required.
