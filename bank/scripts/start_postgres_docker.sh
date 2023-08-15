#!/bin/bash

# Start a local Posgres docker
docker run --name=bankdb --env=POSTGRES_PASSWORD=dbos --env=PGDATA=/var/lib/postgresql/data --volume=/var/lib/postgresql/data -p 5432:5432 -d postgres:latest