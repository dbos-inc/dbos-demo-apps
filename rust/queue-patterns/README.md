# Queue Patterns

This example demonstrates how to use several advanced queue patterns in DBOS.
In particular, it demonstrates **fair queueing**, **rate limits**, and **debouncing**.

## Setup

1. Start Postgres (if you already use Postgres, instead set the `DBOS_SYSTEM_DATABASE_URL` environment variable to your database connection string):

```bash
docker run -d --name queue-patterns-pg -e POSTGRES_PASSWORD=dbos -p 5432:5432 postgres:17
```

2. Start the application, which builds the frontend first, so it needs Node.js as well as Rust:

```shell
# Replace with your URL as needed.
export DBOS_SYSTEM_DATABASE_URL="postgres://postgres:dbos@localhost:5432/dbos_queue_patterns_dbos_sys"
./launch_app.sh
```

Visit http://localhost:8000 to see the queues demo!

## Tests

`cargo test` runs the app in-process against the same Postgres, driving its HTTP routes without
binding a port. Each test drops and recreates a database of its own, named after the app's with
`_test_<name>` appended, so it starts from nothing whatever an earlier run left behind.
