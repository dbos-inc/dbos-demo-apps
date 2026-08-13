# Queue Patterns

This example demonstrates how to use several advanced queue patterns in DBOS.
In particular, it demonstrates **fair queueing**, **rate limits**, and **debouncing**.

## Setup

1. Install dependencies:

```shell
go mod download
```

2. Start Postgres (if you already use Postgres, instead set the `DBOS_SYSTEM_DATABASE_URL` environment variable to your database connection string):
```bash
npx dbos postgres start
```

3. Start the application.

```shell
#replace with your URL as needed...
export DBOS_SYSTEM_DATABASE_URL="postgres://postgres:dbos@localhost:5432/queue_patterns_dbos_sys"
./launch_app.sh
```

Visit http://localhost:8000 to see the queues demo!
