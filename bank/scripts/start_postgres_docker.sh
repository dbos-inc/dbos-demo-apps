#!/bin/bash

# Check if PGPASSWORD is set
if [[ -z "${PGPASSWORD}" ]]; then
  echo "Error: PGPASSWORD is not set." >&2
  exit 1
fi

# Use default PG port, if not set
if [[ -z "${PGPORT}" ]]; then
  PGPORT=5432
fi

# Start Postgres in a local Docker container
docker run --rm --name=bankdb --env=POSTGRES_PASSWORD=${PGPASSWORD} --env=PGDATA=/var/lib/postgresql/data --volume=/var/lib/postgresql/data -p ${PGPORT}:5432 -d postgres:16.1

# Wait for PostgreSQL to start
echo "Waiting for PostgreSQL to start..."
for i in {1..30}; do
  if docker exec bankdb pg_isready -U postgres | grep -q "accepting connections"; then
    echo "PostgreSQL started!"
    break
  fi
  sleep 1
done

# Create a new user and database for each bank ('bank_a', 'bank_b').
docker exec bankdb psql -U postgres -c "CREATE USER bank_a WITH PASSWORD '${PGPASSWORD}';"
docker exec bankdb psql -U postgres -c "ALTER USER bank_a CREATEDB;"
docker exec bankdb psql -U postgres -c "CREATE USER bank_b WITH PASSWORD '${PGPASSWORD}';"
docker exec bankdb psql -U postgres -c "ALTER USER bank_b CREATEDB;"

# Drop if exists and create a new one.
docker exec bankdb psql -U postgres -c "CREATE DATABASE bank_a OWNER bank_a;"
echo "Database user: 'bank_a' and database: 'bank_a' created."
docker exec bankdb psql -U postgres -c "CREATE DATABASE bank_b OWNER bank_b;"
echo "Database user: 'bank_b' and database: 'bank_b' created."
