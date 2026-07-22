# DBOS Go Toolbox

This app contains example code for many DBOS features, including workflows, steps, queues, and scheduled workflows.
You can use it as a template when starting a new DBOS app&mdash;start by editing `main.go`.

To learn more about how to program with DBOS, check out the [DBOS programming guide](https://docs.dbos.dev/golang/programming-guide).

## Setup

1. Install dependencies
```bash
go mod tidy
```

2. Set the `DBOS_SYSTEM_DATABASE_URL` environment variable to point DBOS to a system database.

The simplest option is SQLite, which requires no database server&mdash;DBOS stores its state in a local file:

```bash
export DBOS_SYSTEM_DATABASE_URL="sqlite:dbos_go_toolbox.db"
```

Alternatively, use Postgres. Install the DBOS Go CLI, start Postgres in a local Docker container, and point the variable at it:

```bash
go install github.com/dbos-inc/dbos-transact-golang/cmd/dbos@latest
dbos postgres start
export DBOS_SYSTEM_DATABASE_URL="postgres://postgres:dbos@localhost:5432/dbos_go_toolbox"
```

## Running the App

```bash
go run main.go
```

The app serves at `http://localhost:8080`
