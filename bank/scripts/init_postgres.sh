#!/bin/bash

# To run this script without manually typing password, you need to set POSTGRES_PASSWORD env to the superuser password.
# Get the user name and password from env.
if [[ -z "${BANK_DB_NAME}" ]]; then
  export BANK_DB_NAME="bank"
fi

if [[ -z "${BANK_DB_PASSWORD}" ]]; then
  export BANK_DB_PASSWORD="bank"
fi

if [[ -z "${POSTGRES_HOST}" ]]; then
  export POSTGRES_HOST="localhost"
fi

if [[ -z "${POSTGRES_PORT}" ]]; then
  export POSTGRES_PORT=5432
fi

export PGPASSWORD="${POSTGRES_PASSWORD}"
# Create a new user and the database with the same name.
psql -U postgres -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -c "CREATE USER ${BANK_DB_NAME} WITH PASSWORD '${BANK_DB_PASSWORD}';"
psql -U postgres -h $POSTGRES_HOST -p ${POSTGRES_PORT} -c "ALTER USER ${BANK_DB_NAME} CREATEDB;"
export PGPASSWORD="${BANK_DB_PASSWORD}"

# Drop if exists and create a new one.
psql -U ${BANK_DB_NAME} -h ${POSTGRES_HOST} -d postgres -p ${POSTGRES_PORT} -c "DROP DATABASE IF EXISTS ${BANK_DB_NAME};"
psql -U ${BANK_DB_NAME} -h ${POSTGRES_HOST} -d postgres -p ${POSTGRES_PORT} -c "CREATE DATABASE ${BANK_DB_NAME} OWNER ${BANK_DB_NAME};"

echo "Database user and DB created."⏎