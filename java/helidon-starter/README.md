# DBOS Starter app for Helidon

## Prerequisites

- Java 21 or later
  - Note: DBOS supports Java 17, but this demo requires 21
- PostgreSQL running on localhost:5432
  - can be overridden with `DBOS_SYSTEM_JDBC_URL` env var
- PostgreSQL user and password in `PGUSER` and `PGPASSWORD` env vars
  - defaults to `postgres` user and `dbos` password

## Setup

```bash
./mvnw package
java -jar target/helidon-starter.jar
```

The application runs on `http://localhost:8080` by default.  (See `application.yaml`.)

You can also run the application tests with:
```bash
# test application
./mvnw test
```
