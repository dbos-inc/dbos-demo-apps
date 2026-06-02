# DBOS Starter app for Scala

> **Note:** This is a community prototype that demonstrates DBOS running on Scala via the Java interop layer.
> It is a placeholder until official first-class Scala support is added to DBOS.

## Prerequisites

- Java 17 or later
- [SBT](https://www.scala-sbt.org/download) 1.10 or later
- PostgreSQL running on localhost:5432
  - can be overridden with `DBOS_SYSTEM_JDBC_URL` env var
- PostgreSQL user and password in `PGUSER` and `PGPASSWORD` env vars
  - defaults to `postgres` user and `dbos` password

## Setup

```bash
# Start application
sbt run
```

The application runs on `http://localhost:7070` by default.

```bash
# Run tests
sbt test
```

## Development

```bash
# Check formatting
sbt scalafmtCheck

# Apply formatting fixes
sbt scalafmt

# Check lint (no changes applied)
sbt "scalafix --check"

# Apply lint fixes
sbt scalafix

```
