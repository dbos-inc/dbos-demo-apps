# Widget Store - Java Spring Boot

## Prerequisites

- Java 17 or later
- PostgreSQL running on localhost:5432
- PostgreSQL user `postgres` with password in `PGPASSWORD` evn var

> Note, the widget store demo app needs two PostgreSQL databases. 
> One for the DBOS System Database and one used by the Widget Store app.
> DBOS automatically creates the system database on startup (assuming credentials allow).
> The app database is also created on startup (again, assuming credentials allow) 

## Setup

```bash
# Start application
./gradlew bootRun
```

The application runs on `http://localhost:8080` by default.