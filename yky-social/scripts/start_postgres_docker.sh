#!/bin/bash

# Check if POSTGRES_PASSWORD et al set
if [[ -z "${POSTGRES_PASSWORD}" ]]; then
  echo "Error: POSTGRES_PASSWORD is not set." >&2
  exit 1
fi
if [[ -z "${POSTGRES_USERNAME}" ]]; then
  echo "Error: POSTGRES_USERNAME is not set." >&2
  exit 1
fi
if [[ -z "${POSTGRES_PASSWORD}" ]]; then
  echo "Error: POSTGRES_PASSWORD is not set." >&2
  exit 1
fi
if [[ -z "${POSTGRES_PORT}" ]]; then
  echo "Error: POSTGRES_PORT is not set." >&2
  exit 1
fi

# Start Postgres in a local Docker container
docker run --rm --name=ykydb --env=POSTGRES_PASSWORD=${POSTGRES_PASSWORD} --env=PGDATA=/var/lib/postgresql/data --volume=/var/lib/postgresql/data -p ${POSTGRES_PORT}:5432 -d postgres:16.1

# Wait for PostgreSQL to start
echo "Waiting for PostgreSQL to start on port ${POSTGRES_PORT}..."
for i in {1..30}; do
  if docker exec ykydb pg_isready -U postgres | grep -q "accepting connections"; then
    echo "PostgreSQL started!"
    break
  fi
  sleep 1
done

# Create a new user and the database
docker exec ykydb psql -U postgres -c "CREATE USER ${POSTGRES_USERNAME} WITH PASSWORD '${POSTGRES_PASSWORD}';"
docker exec ykydb psql -U postgres -c "ALTER USER ${POSTGRES_USERNAME} CREATEDB;"

# Drop if exists and create a new one.
docker exec ykydb psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS ${POSTGRES_DATABASE};"
docker exec ykydb psql -U postgres -h localhost -c "CREATE DATABASE ${POSTGRES_DATABASE} OWNER ${POSTGRES_USERNAME};"
docker exec ykydb psql -U postgres -h localhost -c "CREATE DATABASE opsys OWNER socialts;"

echo "Database user: '${POSTGRES_USERNAME}' and database: '${POSTGRES_DATABASE}' created."
