#!/bin/bash

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"

# Check if PGPASSWORD is set
if [[ -z "${PGPASSWORD}" ]]; then
  echo "Error: PGPASSWORD is not set." >&2
  exit 1
fi

BANK_DB_NAME="bank"
POSTGRES_HOST="host.docker.internal"
POSTGRES_PORT=5432

docker pull quay.io/keycloak/keycloak:latest

# This script will start a Keycloak server in a docker container with two pre-configured users in the DBOS realm.
docker run --rm  -d -p 8083:8080 --name keycloak --add-host=host.docker.internal:host-gateway \
  -e KEYCLOAK_ADMIN=dbos-admin -e KEYCLOAK_ADMIN_PASSWORD=dbos-pass \
  -e KC_DB=postgres -e KC_DB_DATABASE=${BANK_DB_NAME} -e KC_DB_SCHEMA=keycloak \
  -e KC_DB_URL_DATABASE=${BANK_DB_NAME} -e KC_DB_PASSWORD=${PGPASSWORD} -e KC_DB_URL_HOST=${POSTGRES_HOST} -e KC_DB_URL_PORT=${POSTGRES_PORT} -e KC_DB_USERNAME=${BANK_DB_NAME} \
  -v ${SCRIPT_DIR}/dbos-realm.json:/opt/keycloak/data/import/realm.json \
  quay.io/keycloak/keycloak:latest start-dev --import-realm 
