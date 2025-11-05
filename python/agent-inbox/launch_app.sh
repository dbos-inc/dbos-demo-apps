#!/bin/bash

# Start backend
uv run python main.py &
BACKEND_PID=$!

# Start frontend
cd frontend && npm i && npm run dev &
FRONTEND_PID=$!

# Trap to kill both processes on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

# Wait for both processes
wait
