# Transactional Outbox

This app shows how to implement a transactional outbox-like pattern using a DBOS workflow.
We show how to atomically create an order in a database and send a notification about the order.

We demonstrate two patterns:

1. In `atomic_workflow.py`, a single `@DBOS.workflow()` guarantees that every order is inserted **and** its notification is sent, atomically, despite failures.
2. In `transactional_enqueue.py`, we transactionally enqueue a DBOS workflow in the transaction that creates the order; the workflow then sends the notification.

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
uv run atomic_workflow.py
```

Or:

```shell
uv run transactional_enqueue.py
```


Visit [`http://localhost:8000`](http://localhost:8000) to place orders and watch notifications get sent.
