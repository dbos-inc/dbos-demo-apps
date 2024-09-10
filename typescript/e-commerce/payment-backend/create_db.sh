#!/bin/bash

dbcontainer="debug-proxy-demo"

docker exec $dbcontainer psql -U postgres -c "CREATE DATABASE payment;"

npm run migrate