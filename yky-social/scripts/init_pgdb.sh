#!/bin/bash

# Create the new user 'socialts'
psql -U postgres -h localhost -c "CREATE USER socialts WITH PASSWORD 'socialts';"

# Drop the DB if it already exists, then create it again
psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS socialts;"
psql -U postgres -h localhost -c "CREATE DATABASE socialts OWNER socialts;"
psql -U postgres -h localhost -c "CREATE DATABASE opsys OWNER socialts;"

echo "Database and user created successfully"
