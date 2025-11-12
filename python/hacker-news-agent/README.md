# Hacker News Research Agent

An autonomous research agent for searching Hacker News built with DBOS.
You can find a detailed walkthrough [here](https://docs.dbos.dev/python/examples/hacker-news-agent).

## Setup

1. Install dependencies:

```bash
uv sync
```

2. Set your OpenAI API key:
```bash
export OPENAI_API_KEY='your-api-key-here'
```

3. Run the launch script to start the React frontend and agentic backend.
The app is available at http://localhost:5173/.

```bash
./launch_app.sh
```