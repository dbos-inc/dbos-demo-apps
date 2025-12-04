#!/bin/bash

# Trap ctrl+c and kill all background processes
trap 'kill $(jobs -p) 2>/dev/null; exit' INT TERM

# Build the frontend
cd frontend && npm install && npm run build && cd ..

# Launch both server and worker processes
uv run python3 server.py &
uv run python3 worker.py &

# Wait for both background processes
wait
