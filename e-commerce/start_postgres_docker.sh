#!/bin/bash

# Check if PGPASSWORD is set
if [[ -z "${PGPASSWORD}" ]]; then
  echo "Error: PGPASSWORD is not set." >&2
  exit 1
fi

# Start Postgres in a local Docker container
docker run --rm --name=dbos-ecommerce --env=POSTGRES_PASSWORD=${PGPASSWORD} --env=PGDATA=/var/lib/postgresql/data --volume=/var/lib/postgresql/data -p 5432:5432 -d postgres:16.1

# Wait for PostgreSQL to start
echo "Waiting for PostgreSQL to start..."
for i in {1..30}; do
  if docker exec dbos-ecommerce pg_isready -U postgres | grep -q "accepting connections"; then
    echo "PostgreSQL started!"
    break
  fi
  sleep 1
done

# Create a database in Postgres.
docker exec dbos-ecommerce psql -U postgres -c "CREATE DATABASE shop;"
docker exec dbos-ecommerce psql -U postgres -c "CREATE DATABASE payment;"

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
npm run --prefix $SCRIPT_DIR/shop-backend db:setup
npm run --prefix $SCRIPT_DIR/payment-backend db:setup
