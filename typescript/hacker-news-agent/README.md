# Hacker News Research Agent

An autonomous research agent for searching Hacker News built with DBOS.
You can find a detailed walkthrough [here](https://docs.dbos.dev/python/examples/hacker-news-agent).

## Setup

1. Install dependencies and build the project:
```bash
npm install
npm run build
```

2. Set your OpenAI API key:
```bash
export OPENAI_API_KEY='your-api-key-here'
```

3. Start Postgres (if you already use Postgres, instead set the `DBOS_DATABASE_URL` environment variable to your database connection string):
```bash
npx dbos postgres start
```

## Usage

```bash
npx agent "artificial intelligence"
```

If the agent fails at any point during its research, you can restart it using its workflow ID to recover it from where it left off:

```shell
npx agent "artificial intelligence" --workflow-id <id>
```

## Code Structure

- **`src/workflows.ts`** - Main DBOS workflows orchestrating the research process
- **`src/agent.ts`** - Core agent decision-making logic
- **`src/llm.ts`** - OpenAI API integration with core LLM calls
- **`src/api.ts`** - Hacker News API integration
- **`src/cli.ts`** - Command-line interface and result formatting