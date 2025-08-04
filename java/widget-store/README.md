# Widget Store - Java Spring Boot

## Prerequisites

- Java 21 or later
- PostgreSQL running on localhost:5432
- PostgreSQL user `postgres` with password `dbos`

## Setup

```bash
# Create database
createdb -h localhost -U postgres widget_store_java

# Run migration
psql -h localhost -U postgres -d widget_store_java -f schema/init.sql

# Start application
./gradlew bootRun
```

The application runs on `http://localhost:3000`