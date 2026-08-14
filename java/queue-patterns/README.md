# Queue Patterns

This example demonstrates how to use several advanced queue patterns in DBOS.
In particular, it demonstrates **fair queueing**, **rate limits**, and **debouncing**.

## Setup

1. Start Postgres (if you already use Postgres, instead set the `DBOS_SYSTEM_JDBC_URL` environment variable to your database connection string):
```bash
npx dbos postgres start
```

2. Start the application.

```shell
#replace with your URL as needed...
export DBOS_SYSTEM_JDBC_URL="jdbc:postgresql://localhost:5432/dbos_queue_patterns_java"
./launch_app.sh
```

Visit http://localhost:8000 to see the queues demo!
