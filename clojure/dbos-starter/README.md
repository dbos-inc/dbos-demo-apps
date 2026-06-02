# DBOS Starter app for Clojure

## Prerequisites

- Java 17 or later
- Clojure version 1.12
- PostgreSQL running on localhost:5432
  - can be overridden with `DBOS_SYSTEM_JDBC_URL` env var
- PostgreSQL user and password in `PGUSER` and `PGPASSWORD` env vars
  - defaults to `postgres` user and `dbos` password

## Setup

```bash
# Start application
clj -M:run
```

The application runs on `http://localhost:7070` by default.

## Development

```bash
# Check for outdated dependencies
clj -M:antq

# Lint source files
clj -M:lint

# Check formatting
clj -M:fmt

# Apply formatting fixes
clj -M:fix
```