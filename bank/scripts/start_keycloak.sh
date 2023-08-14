#!/bin/bash

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"

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

docker pull quay.io/keycloak/keycloak:latest

# This script will start a Keycloak server in a docker container with some pre-configured users in the DBOS realm.
docker run --name keycloak -p 8083:8080 -e KEYCLOAK_ADMIN=dbos-admin -e KEYCLOAK_ADMIN_PASSWORD=dbos-pass \
  -v ${SCRIPT_DIR}/dbos-realm.json:/opt/keycloak/data/import/realm.json \
  -e DB_VENDOR=postgres -e DB_DATABASE=${BANK_DB_NAME} -e DB_SCHEMA=keycloak \
  -e DB_USER=${BANK_DB_NAME} -e DB_PASSWORD=${BANK_DB_PASSWORD} -e DB_ADDR=${POSTGRES_HOST}:${POSTGRES_PORT} \
  quay.io/keycloak/keycloak:latest start-dev --import-realm