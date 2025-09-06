# DBOS Go Starter

This example app demonstrates the durability of DBOS workflows.

To learn more about how to program with DBOS, check out the [DBOS programming guide](https://docs.dbos.dev/golang/programming-guide).

## Setup

1. Install dependencies
```bash
go mod tidy
```

2. Install the DBOS Go CLI and start Postgres in a local Docker container:

```bash
go install github.com/dbos-inc/dbos-transact-golang/cmd/dbos@latest
dbos postgres start
```

3. Set the `DBOS_SYSTEM_DATABASE_URL` environment variable to point to it.
```bash
export DBOS_SYSTEM_DATABASE_URL="postgres://postgres:dbos@localhost:5432/dbos_go_starter"
```

## Running the App

```bash
go run main.go
```

The app serves at `http://localhost:8080`
