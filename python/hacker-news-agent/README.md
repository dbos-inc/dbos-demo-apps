# Hacker News Research Agent

An autonomous research agent for searching Hacker News built with DBOS.

## Setup

1. Install dependencies:
```bash
uv sync
```

2. Set your OpenAI API key:
```bash
export OPENAI_API_KEY='your-api-key-here'
```

3. Start PostgreSQL (required for DBOS):
```bash
dbos postgres start
```

## Usage

```bash
uv run python -m hacker_news_agent "artificial intelligence"
```

If the agent fails at any point during its research, you can restart it using its workflow ID to recover it from where it left off:

```shell
python -m hacker_news_agent "artificial intelligence" --workflow-id <id>
```

## Code Structure

- **`workflows.py`** - Main DBOS workflows orchestrating the research process
- **`agent.py`** - Core agent decision-making logic
- **`llm.py`** - OpenAI API integration with core LLM calls
- **`api.py`** - Hacker News API integration
- **`cli.py`** - Command-line interface and result formatting