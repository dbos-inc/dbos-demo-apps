# DBOS Cross-Language Interops

Four tiny apps — Python, TypeScript, Go, Java — that enqueue the *same* DBOS
workflow to each other across language boundaries.

They demonstrate DBOS **portable workflows**: a workflow registered in one runtime
can be enqueued, messaged, and awaited from another, because arguments and results
are serialized in a language-neutral format over a shared system database.

📖 <https://docs.dbos.dev/explanations/portable-workflows>

## How it works

Every app registers the same workflow contract: name `echoWorkflow`, class/instance
`interop`/`default`, queue `interop-queue-{language}`, serialization `portable`.
`echoWorkflow` echoes its args, waits for a `date-msg` (`DBOS.recv`), and returns the
same JSON from every runtime:

```json
{"echo_text": "hello-interop", "echo_num": 42, "echo_float": 3.14,
 "items_count": 3, "echo_date": "2025-01-15", "msg_date": "2025-03-15"}
```

Each app also exposes `POST /enqueue/{target}`, which portable-enqueues `echoWorkflow`
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

## Run it

Prereqs: PostgreSQL on `localhost:5432`, plus the toolchains for the apps you run
(Python 3.11+, Node.js, Go 1.26+, JDK 21).

Start Postgres (creates the shared `interop_dbos_sys` database; each app migrates its
schema on launch):

```bash
docker compose up -d
SYS_DB_URL=postgresql://postgres:dbos@localhost:5432/interop_dbos_sys
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

The payload shape matches the **target** language's signature — see `TARGET_PAYLOADS`
in `test_interops.py`. To exercise all 12 pairs with the four apps running:

```bash
pip install pytest requests && pytest -s test_interops.py
```
