#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "Starting FastAPI server..."
uv run python3 main.py
