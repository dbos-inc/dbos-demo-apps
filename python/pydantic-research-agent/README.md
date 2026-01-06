# Pydantic AI Research Agent

An autonomous research agent for doing deep Internet research with DBOS and Pydantic AI.


## Setup

1. Install dependencies:

```bash
uv sync
```

2. Set your Anthropic and Google Gemini API keys:
```bash
export ANTHROPIC_API_KEY='your-api-key-here'
export GOOGLE_API_KEY='your-api-key-here'
```

3. Run the launch script to start the React frontend and agentic backend.
The app is available at http://localhost:5173/.

```bash
./launch_app.sh
```
