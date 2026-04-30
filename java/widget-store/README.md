# Widget Store - Java Spring Boot

## Prerequisites

- Java 17 or later
- PostgreSQL running on localhost:5432
- PostgreSQL user `postgres` with password in `PGPASSWORD` evn var

> Note, by default the widget store demo app places the application tables and the DBOS system tables in the same database.
> This can be changed by specifying dbos.datasource properties that reference a different PostgreSQL database than spring.datasource properties references.
> DBOS automatically creates the system database on startup (if needed, assuming credentials allow).
> This demo app is configured to create the app database on startup (again, if needed and assuming credentials allow).

## Setup

```bash
# Start application
./gradlew bootRun
```

The application runs on `http://localhost:8080` by default.