#!/bin/bash

# Trap ctrl+c and kill all background processes
trap 'kill $(jobs -p) 2>/dev/null; exit' INT TERM

# Build the frontend
cd frontend && npm install && npm run build && cd ..

# Launch both server and worker processes
npm run server &
npm run worker &

# Wait for both background processes
wait
