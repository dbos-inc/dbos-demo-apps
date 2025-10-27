# Starter - Java Spring Boot

## Prerequisites

- Java 21 or later (The DBOS Transact SDK Supports Java 17+)
- PostgreSQL running on localhost:5432
- PostgreSQL user `postgres` with password `dbos`

## Setup

```bash
# Start application
./gradlew bootRun
```

The application runs on `http://localhost:8080` by default.  (See `application.properties`.)

You can also build the application with:
```bash
# Build application
./gradlew clean build
```