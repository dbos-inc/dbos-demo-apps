# DBOS Go Toolbox

This app contains example code for many DBOS features, including workflows, steps, queues, and scheduled workflows.
You can use it as a template when starting a new DBOS app&mdash;start by editing `main.go`.

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
export DBOS_SYSTEM_DATABASE_URL="postgres://postgres:dbos@localhost:5432/dbos_go_toolbox"
```

## Running the App

```bash
go run main.go
```

The app serves at `http://localhost:8080`

## Connecting to DBOS Conductor

To monitor and manage this app from [DBOS Conductor](https://docs.dbos.dev/production/conductor), set `DBOS_CONDUCTOR_KEY` to a Conductor API key before starting it.
The Conductor client lives in the closed-source `go.dbos.dev/dbos-enterprise-go` module, which `main.go` imports with `_ "go.dbos.dev/dbos-enterprise-go"`.
It must be at the same minor version as `github.com/dbos-inc/dbos-transact-golang`.
