#!/bin/bash

# Check if PGPASSWORD is set
if [[ -z "${PGPASSWORD}" ]]; then
  echo "Error: PGPASSWORD is not set." >&2
  exit 1
fi

# Start Postgres in a local Docker container
docker run --rm --name=operon-ecommerce --env=POSTGRES_PASSWORD=${PGPASSWORD} --env=PGDATA=/var/lib/postgresql/data --volume=/var/lib/postgresql/data -p 5432:5432 -d postgres:15.4 -c wal_level=logical

# Install wal2json
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

# run DB migrations
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
npm run --prefix $SCRIPT_DIR/shop-backend migrate
npm run --prefix $SCRIPT_DIR/payment-backend migrate

# create WAL reader slot
docker exec operon-ecommerce psql -U postgres -d shop -c "SELECT * FROM pg_create_logical_replication_slot('operon_prov', 'wal2json');"

# Add Seed Data
npm run --prefix $SCRIPT_DIR/shop-backend seed

# create a database in Postgres for the shop provenance data
docker exec operon-ecommerce psql -U postgres -c "CREATE DATABASE shop_prov;"

docker exec operon-ecommerce psql -U postgres -d shop_prov -c "CREATE SCHEMA IF NOT EXISTS operon;"

docker exec operon-ecommerce psql -U postgres -d shop_prov -c "CREATE TABLE IF NOT EXISTS operon.transaction_outputs (workflow_uuid TEXT NOT NULL, function_id INT NOT NULL, output TEXT, error TEXT, txn_id TEXT, txn_snapshot TEXT NOT NULL, PRIMARY KEY (workflow_uuid, function_id));"

docker exec operon-ecommerce psql -U postgres -d shop_prov -c "CREATE TABLE cart(
    username character varying(255) NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);"

docker exec operon-ecommerce psql -U postgres -d shop_prov -c "CREATE TABLE order_items(
    order_id integer NOT NULL,
    product_id integer NOT NULL,
    price integer NOT NULL,
    quantity integer NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);"

docker exec operon-ecommerce psql -U postgres -d shop_prov -c "CREATE TABLE orders(
    order_id integer NOT NULL,
    username character varying(255) NOT NULL,
    order_status integer NOT NULL,
    stripe_session_id character varying(255) NOT NULL,
    last_update_time bigint NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);"

docker exec operon-ecommerce psql -U postgres -d shop_prov -c "CREATE TABLE products(
    product_id integer NOT NULL,
    product character varying(255) NOT NULL,
    description text NOT NULL,
    image_name character varying(255) NOT NULL,
    price integer NOT NULL,
    inventory integer NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);"

docker exec operon-ecommerce psql -U postgres -d shop_prov -c "CREATE TABLE users(
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    begin_xid xid8 NOT NULL,
    end_xid xid8 NULL);"
