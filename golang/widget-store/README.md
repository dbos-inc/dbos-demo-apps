# Widget Store

This app uses DBOS to build an online storefront that's resilient to any failure.
You can interrupt it at any time (we even provide a crash button to facilitate experimentation) and it will recover from exactly where it left off.

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

3. Install golang-migrate:
```bash
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

4. Create a database for this application and set the `DBOS_SYSTEM_DATABASE_URL` environment variable to point to it.
```bash
createdb -h localhost -U postgres widget_store_go
export DBOS_SYSTEM_DATABASE_URL="postgres://postgres:dbos@localhost:5432/widget_store_go"
```

5. Create the application tables.
```bash
migrate -path ./migrations -database $DBOS_SYSTEM_DATABASE_URL up
```

## Running the App

```bash
# Run directly
make run

# Or build and run
make build
./widget-store
```

The app serves at `http://localhost:8080`
