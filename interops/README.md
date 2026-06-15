# DBOS Cross-Language Interops

A set of four tiny apps — one each in **Python, TypeScript, Go, and Java** — that
enqueue the *same* DBOS workflow to each other across language boundaries.

They demonstrate DBOS **portable workflows**: a workflow registered in one runtime
can be enqueued, messaged, and awaited from a *different* runtime, because the
arguments and results are serialized in a language-neutral (portable) format and
the runtimes share one DBOS system database.

📖 Full explanation: <https://docs.dbos.dev/explanations/portable-workflows>

## How it works

Every app registers the **same workflow contract**:

| | |
|---|---|
| Workflow name | `echoWorkflow` |
| Class / instance | `interop` / `default` |
| Queue | `interop-queue-{language}` |
| Serialization | `portable` |

`echoWorkflow` echoes its arguments back, waits for a `date-msg` sent by the caller
(`DBOS.recv`), and returns the same JSON shape from every runtime:

```json
{"echo_text": "hello-interop", "echo_num": 42, "echo_float": 3.14,
 "items_count": 3, "echo_date": "2025-01-15", "msg_date": "2025-03-15"}
```

Each app also exposes an HTTP endpoint that acts as the *caller*:

`POST /enqueue/{target}` — uses the SDK's **portable enqueue** to put `echoWorkflow`
  on `interop-queue-{target}`, sends it a date message, awaits the result, and returns it.

So `POST http://localhost:8001/enqueue/go` means *"the Python app enqueues the Go app's
workflow."* With four runtimes that's 12 directed source→target pairs — every language
driving every other.

```
apps/
├── interop-python/      # FastAPI  :8001   interop-queue-python
├── interop-typescript/  # Express  :8002   interop-queue-typescript
├── interop-go/          # net/http :8003   interop-queue-go
└── interop-java/        # Javalin  :8004   interop-queue-java
```

Notice each `echoWorkflow` has a *different* native signature (Go takes one typed
struct; Python mixes positional and keyword args; TS/Java take five positional args).
Portable serialization is what lets one caller's `{positionalArgs, namedArgs}` envelope
map onto another language's signature.

## Prerequisites

- PostgreSQL on `localhost:5432` (a `docker-compose.yml` is provided)
- The toolchains for whichever apps you want to run: Python 3.11+, Node.js, Go 1.26+, JDK 21

## 1. Start Postgres

```bash
docker compose up -d
```

This creates the shared system database `interop_dbos_sys`. Each app applies its DBOS
schema automatically on launch.

## 2. Build & run each app

Run each in its own terminal. They share one system database via
`DBOS_SYSTEM_DATABASE_URL` (Java uses the JDBC equivalent).

```bash
SYS_DB_URL=postgresql://postgres:dbos@localhost:5432/interop_dbos_sys
```

**Python** (`:8001`)
```bash
cd apps/interop-python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DBOS_SYSTEM_DATABASE_URL=$SYS_DB_URL PORT=8001 python main.py
```

**TypeScript** (`:8002`)
```bash
cd apps/interop-typescript
npm install && npm run build
DBOS_SYSTEM_DATABASE_URL=$SYS_DB_URL PORT=8002 npm start
```

**Go** (`:8003`)
```bash
cd apps/interop-go
go build -o main .
DBOS_SYSTEM_DATABASE_URL=$SYS_DB_URL PORT=8003 ./main
```

**Java** (`:8004`)
```bash
cd apps/interop-java
./gradlew shadowJar
DBOS_SYSTEM_JDBC_URL=jdbc:postgresql://localhost:5432/interop_dbos_sys \
  PGUSER=postgres PGPASSWORD=dbos SERVER_PORT=8004 \
  java -jar build/libs/interop-java-all.jar
```

## 3. Try it

Have Python enqueue the Go workflow:

```bash
curl -s localhost:8001/enqueue/go \
  -H 'content-type: application/json' \
  -d '{"positionalArgs":[{"text":"hello-interop","num":42,"float":3.14,"items":["alpha","beta","gamma"],"date":"2025-01-15"}],"namedArgs":{}}'
```

The payload shape depends on the **target** language's signature — see `TARGET_PAYLOADS`
in `test_interops.py`.

### Run all 12 pairs at once

With all four apps running:

```bash
pip install pytest requests
pytest -s test_interops.py
```

This exercises every source→target combination and checks the result is identical
regardless of which runtime produced it.
