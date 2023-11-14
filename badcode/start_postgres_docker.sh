#!/bin/bash

# Check if PGPASSWORD is set
if [[ -z "${PGPASSWORD}" ]]; then
  echo "Error: PGPASSWORD is not set." >&2
  exit 1
fi

# Check if POSTGRES_PORT is set
if [[ -z "${POSTGRES_PORT}" ]]; then
  POSTGRES_PORT=5432
fi

# Start Postgres in a local Docker container
docker run --rm --name=operon-db --env=POSTGRES_PASSWORD=${PGPASSWORD} --env=PGDATA=/var/lib/postgresql/data --volume=/var/lib/postgresql/data -p ${POSTGRES_PORT}:5432 -d postgres:15.4

# Wait for PostgreSQL to start
echo "Waiting for PostgreSQL to start..."
for i in {1..30}; do
  if docker exec operon-db pg_isready -U postgres | grep -q "accepting connections"; then
    echo "PostgreSQL started!"
    break
  fi
  sleep 1
done

# Create a database in Postgres.
docker exec operon-db psql -U postgres -c "CREATE DATABASE hello;"