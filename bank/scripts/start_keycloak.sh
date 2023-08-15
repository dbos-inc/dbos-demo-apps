#!/bin/bash

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"

if [[ -z "${BANK_DB_NAME}" ]]; then
  export BANK_DB_NAME="bank"
fi

if [[ -z "${BANK_DB_PASSWORD}" ]]; then
  export BANK_DB_PASSWORD="bank"
fi

if [[ -z "${POSTGRES_HOST}" ]]; then
  export POSTGRES_HOST="host.docker.internal"
fi

if [[ -z "${POSTGRES_PORT}" ]]; then
  export POSTGRES_PORT=5432
fi

docker pull quay.io/keycloak/keycloak:latest

# This script will start a Keycloak server in a docker container with some pre-configured users in the DBOS realm.
docker run -p 8083:8080 --name keycloak -e KEYCLOAK_ADMIN=dbos-admin -e KEYCLOAK_ADMIN_PASSWORD=dbos-pass \
  -e KC_DB=postgres -e KC_DB_DATABASE=${BANK_DB_NAME} -e KC_DB_SCHEMA=keycloak \
  -e KC_DB_URL_DATABASE=${BANK_DB_NAME} -e KC_DB_PASSWORD=${BANK_DB_PASSWORD} -e KC_DB_URL_HOST=${POSTGRES_HOST} -e KC_DB_URL_PORT=${POSTGRES_PORT} -e KC_DB_USERNAME=${BANK_DB_NAME} \
  -v ${SCRIPT_DIR}/dbos-realm.json:/opt/keycloak/data/import/realm.json \
  quay.io/keycloak/keycloak:latest start-dev --import-realm