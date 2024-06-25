#!/bin/bash

# Check if PGPASSWORD is set
if [[ -z "${PGPASSWORD}" ]]; then
  echo "Error: PGPASSWORD is not set." >&2
  exit 1
fi

# Start Postgres in a local Docker container
docker run --rm --name=bankdb --env=POSTGRES_PASSWORD=${PGPASSWORD} --env=PGDATA=/var/lib/postgresql/data --volume=/var/lib/postgresql/data -p 5432:5432 -d postgres:16.1

# Wait for PostgreSQL to start
echo "Waiting for PostgreSQL to start..."
for i in {1..30}; do
  if docker exec bankdb pg_isready -U postgres | grep -q "accepting connections"; then
    echo "PostgreSQL started!"
    break
  fi
  sleep 1
done

# Create a new user and the database with the same name ('bank').
docker exec bankdb psql -U postgres -c "CREATE USER bank WITH PASSWORD '${PGPASSWORD}';"
docker exec bankdb psql -U postgres -c "ALTER USER bank CREATEDB;"

# Drop if exists and create a new one.
docker exec bankdb psql -U postgres -c "CREATE DATABASE bank OWNER bank;"

echo "Database user: 'bank' and database: 'bank' created."

# Create Keycloak schema
docker exec bankdb psql -U bank -d bank -c "CREATE SCHEMA IF NOT EXISTS keycloak;"
echo "Schema: 'keycloak' created."
