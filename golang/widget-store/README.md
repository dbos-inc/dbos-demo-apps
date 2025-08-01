# Widget Store Go App

Simple Go web application using Gin that serves HTML files and manages a PostgreSQL database.

## Setup

### Install Dependencies
```bash
go mod tidy
```

### Database Migration

1. Install golang-migrate:
```bash
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

2. Set database URL:
```bash
export DBOS_DATABASE_URL="postgres://postgres:dbos@localhost:5432/widget_store_go"
```

3. Run migration:
```bash
migrate -path ./migrations -database $DBOS_DATABASE_URL up
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

## Commands

- `make build` - Build executable
- `make run` - Run with go run  
- `make clean` - Remove build artifacts