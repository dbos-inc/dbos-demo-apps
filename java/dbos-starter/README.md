# DBOS Starter app for Java

## Prerequisites

- Java 17 or later
- PostgreSQL running on localhost:5432
  - can be overridden with `DBOS_SYSTEM_JDBC_URL` env var
- PostgreSQL user and password in `PGUSER` and `PGPASSWORD` env vars
  - defaults to `postgres` user and `dbos` password

## Setup

```bash
# Start application
./gradlew run
```

The application runs on `http://localhost:7070` by default.  (See `application.properties`.)

You can also run the application tests with:
```bash
# test application
./gradlew test
```