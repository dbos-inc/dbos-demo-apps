# DBOS Agentic Hacker News Research Agent

A sophisticated research agent built with DBOS that autonomously researches topics on Hacker News using LLM-powered decision making and multi-step workflows.

## Features

- Autonomous Research: Agent independently plans and executes research
- Iterative Learning: Agent refines queries based on previous findings
- LLM-Powered Decisions: Uses OpenAI GPT for intelligent analysis
- Rich Output: Beautiful CLI interface with progress tracking
- Durable Workflows: DBOS ensures research continues even if interrupted
- Comprehensive Reports: Synthesizes findings into structured insights

## Installation

1. Install dependencies with uv:
```bash
uv sync
```

2. Set your OpenAI API key:
```bash
export OPENAI_API_KEY='your-api-key-here'
```

## Usage

### Basic Agentic Research
```bash
python -m hacker_news_agent "artificial intelligence"
```

### Quick Research (2 iterations, no comments)
```bash
python -m hacker_news_agent "blockchain" --quick
```

### Deep Research (5 iterations with comments)
```bash
python -m hacker_news_agent "startup funding" --deep
```

### Control Max Iterations
```bash
python -m hacker_news_agent "python frameworks" --max-iterations 4
```

### JSON Output
```bash
python -m hacker_news_agent "machine learning" --json
```

### Verbose Mode (see agent reasoning)
```bash
python -m hacker_news_agent "web3" --verbose
```

## How It Works

### Agent Decision Flow

1. Planning Phase: Agent analyzes topic and creates research plan
2. Execution Phase: Agent executes searches and gathers data
3. Analysis Phase: Agent analyzes findings and extracts insights
4. Decision Phase: Agent decides if more research is needed
5. Iteration: Agent generates new queries and repeats
6. Synthesis Phase: Agent synthesizes all findings into final report

### Example Agent Reasoning

**Input**: "AI startups"

**Agent Iteration 1**:
- Plans: "Research AI startup funding, recent launches, market trends"
- Searches: "AI startups 2024", "AI funding", "AI IPO"
- Decides: "Need to understand regulatory landscape"

**Agent Iteration 2**:
- Searches: "AI regulation", "AI safety policy"
- Decides: "Should analyze community sentiment"

**Agent Iteration 3**:
- Analyzes comments on controversial AI policy stories
- Decides: "Sufficient information gathered"

**Final Report**: Comprehensive analysis covering funding trends, regulatory environment, and community sentiment.

## Architecture

- api.py: Hacker News Algolia API integration
- llm.py: OpenAI LLM integration and analysis
- agent.py: Core agent decision-making logic
- workflows.py: DBOS agentic workflows
- cli.py: Rich CLI interface

## DBOS Features Demonstrated

- Durable Agentic Workflows: Agent decisions persist across interruptions
- Step Isolation: Each LLM call and API request is recoverable
- Workflow Composition: Complex agent reasoning chains
- Error Handling: Automatic retries for LLM and API failures
- Stateful Agent Memory: Agent maintains context across steps

## Requirements

- Python 3.10+
- OpenAI API key
- Internet connection for Hacker News API

## License

MIT License