# Widget Store - Java Spring Boot

## Prerequisites

- Java 21 or later (The DBOS Transact SDK Supports Java 17+)
- PostgreSQL running on localhost:5432
- PostgreSQL user `postgres` with password `dbos`

## Setup

```bash
# Create database
createdb -h localhost -U postgres widget_store_java

# Run migration
psql -h localhost -U postgres -d widget_store_java -f schema/init.sql
```

*NOTE:* Due to the use of `jooq`, you _must_ set up the database environment and install the schema before building or running the application.

```
# Start application
./gradlew bootRun
```

The application runs on `http://localhost:3000` by default.