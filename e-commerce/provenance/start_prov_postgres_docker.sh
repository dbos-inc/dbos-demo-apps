#!/bin/bash

# Check if PGPASSWORD is set
if [[ -z "${PGPASSWORD}" ]]; then
  echo "Error: PGPASSWORD is not set." >&2
  exit 1
fi

SCRIPT_DIR=$(dirname $(realpath $0))

# Start Postgres in a local Docker container
docker run --rm --name=operon-ecommerce --env=POSTGRES_PASSWORD=${PGPASSWORD} --env=PGDATA=/var/lib/postgresql/data --volume=/var/lib/postgresql/data -p 5432:5432 -d postgres:15.4 -c wal_level=logical

docker exec operon-ecommerce apt-get update
docker exec operon-ecommerce apt-get install postgresql-15-wal2json -y
docker exec operon-ecommerce sh -c 'echo "wal_level=logical" >> /var/lib/postgresql/data/postgresql.conf'
docker restart operon-ecommerce

# Wait for PostgreSQL to start
echo "Waiting for PostgreSQL to start..."
for i in {1..30}; do
  if docker exec operon-ecommerce pg_isready -U postgres | grep -q "accepting connections"; then
    echo "PostgreSQL started!"
    break
  fi
  sleep 1
done

# Create a database in Postgres.
docker exec operon-ecommerce psql -U postgres -c "CREATE DATABASE shop;"
docker exec operon-ecommerce psql -U postgres -c "CREATE DATABASE payment;"

# Create WAL reader slot
docker exec operon-ecommerce psql -U postgres -d shop -c "SELECT * FROM pg_create_logical_replication_slot('operon_prov', 'wal2json');"

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
npm run --prefix $SCRIPT_DIR/../shop-backend migrate
npm run --prefix $SCRIPT_DIR/../payment-backend migrate

# Configure provenance capture triggers
docker exec -i operon-ecommerce psql -U postgres -d shop -t < ${SCRIPT_DIR}/config_user_tables.sql

# Add Seed Data
npm run --prefix $SCRIPT_DIR/../shop-backend seed


# create a database in Postgres for the shop provenance data
docker exec operon-ecommerce psql -U postgres -c "CREATE DATABASE shop_prov;"

docker exec -i operon-ecommerce psql -U postgres -d shop_prov -t < ${SCRIPT_DIR}/init_prov_tables.sql
