# Deep Research Agent - Frontend

A React-based UI for the Deep Research Agent that allows you to launch AI agents and monitor their progress.

## Features

- Launch new research agents with custom topics
- View all active and completed agents
- Real-time status updates (polls every 3 seconds)
- Display detailed agent information including:
  - Agent ID and creation time
  - Research topic
  - Iteration count
  - Status (running, success, error)
  - Generated reports

## Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Backend Setup

Make sure the backend API is running before using the frontend:

```bash
# From the project root
uv run python -m hacker_news_agent.main
```

The backend should be running on `http://localhost:8000`

## Usage

1. Enter a research topic in the input field
2. Click "Launch Agent" to start a new research agent
3. View the list of agents below with their current status
4. The list automatically refreshes every 3 seconds to show updates

## Tech Stack

- React 18
- TypeScript
- Vite
- CSS3

## API Endpoints

The frontend connects to these backend endpoints:

- `POST /agents` - Start a new research agent
- `GET /agents` - List all agents with their statuses
