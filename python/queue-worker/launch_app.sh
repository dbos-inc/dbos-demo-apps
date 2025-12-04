#!/bin/bash

# Launch both server and worker processes
uv run python3 server.py &
uv run python3 worker.py &

# Wait for both background processes
wait
