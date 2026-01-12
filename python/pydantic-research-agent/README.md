# Pydantic AI Research Agent

An autonomous research agent for doing deep Internet research with DBOS and Pydantic AI.

## Setup

1. Install dependencies:

```bash
uv sync
```

2. Set API keys for model providers.

You can use [Pydantic AI Gateway](https://ai.pydantic.dev/gateway/) to access multiple models with a single key:
```bash
export PYDANTIC_AI_GATEWAY_API_KEY='your-api-key-here'
```

Otherwise, set your Anthropic and Google Gemini API keys to use those providers directly:
```bash
export ANTHROPIC_API_KEY='your-api-key-here'
export GOOGLE_API_KEY='your-api-key-here'
```

3. (Optional) Set your [Logfire](https://logfire.pydantic.dev/docs/) write token to export OpenTelemetry traces to Logfire:
```bash
export LOGFIRE_TOKEN='your-write-token'
```

4. (Optional) Set your [DBOS Conductor](https://docs.dbos.dev/production/conductor) token to visualize and manage your workflows:
```bash
export DBOS_CONDUCTOR_KEY='your-conductor-key'
```

3. Run the launch script to start the React frontend and agentic backend.
The app is available at http://localhost:5173/.

```bash
./launch_app.sh
```
