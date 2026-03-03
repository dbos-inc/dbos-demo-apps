# Transactional Outbox

This app shows how to implement a transactional outbox-like pattern using a DBOS workflow.
Instead of an outbox table and a background poller, a single `@DBOS.workflow()` guarantees that every order is inserted **and** its notification is sent, atomically, despite failures.

## Setup

1. Install dependencies:

```shell
uv sync
```

2. Set your Postgres connection string:

```shell
export DBOS_DATABASE_URL="postgresql+psycopg://postgres@localhost:5432/transactional_outbox"
```

3. Start the app:

```shell
uv run main.py
```

Visit [`http://localhost:8000`](http://localhost:8000) to place orders and watch notifications get sent.
