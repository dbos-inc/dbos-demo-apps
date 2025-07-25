# Hacker News Research Agent (TypeScript)

An autonomous AI research agent that intelligently explores topics on Hacker News, iteratively refining its search queries and synthesizing findings into comprehensive reports.

## Overview

This TypeScript agent autonomously:
1. **Searches** Hacker News for stories and comments on your topic
2. **Analyzes** content to extract technical insights and key information
3. **Generates** follow-up queries to explore different aspects
4. **Decides** when to continue or conclude research
5. **Synthesizes** all findings into a detailed research report

## Features

- **Autonomous Research**: Agent makes its own decisions about what to search next
- **Intelligent Analysis**: Extracts specific technical details, tools, and insights
- **Iterative Refinement**: Explores diverse aspects of topics across multiple iterations
- **Comprehensive Reports**: Generates detailed reports with inline citations
- **Performance Optimized**: Concurrent API calls and efficient data processing

## Prerequisites

- Node.js 16+ and npm
- OpenAI API key

## Setup

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your OpenAI API key:**
   ```bash
   echo "OPENAI_API_KEY=your-api-key-here" > .env
   ```

## Usage

First, build the project:
```bash
npm run build
```

### Basic Research
```bash
npm start "PostgreSQL performance"
```

### Custom Iterations
```bash
npm start "React hooks" --max-iterations 5
```

## Example Output

```
🤖 Starting Agentic Research Agent
The agent will autonomously plan and execute research...

🎯 Starting agentic research for: PostgreSQL performance
🔄 Starting iteration 1/8
🔍 Searching for stories: 'PostgreSQL performance'
📚 Found 25 stories, analyzing all stories...
💬 Reading comments from ALL 25 stories...
🤔 Analyzing findings from 25 stories and 180 comments...
💭 Agent generating next research question...
➡️  Next research focus: 'postgres optimization'

📊 Research Report: PostgreSQL performance
============================================================

🔍 Research Summary:
  • Total Iterations: 3
  • Stories Analyzed: 67
  • Comments Analyzed: 425
  • Average Relevance: 8.2/10

📊 Research Report:
────────────────────────────────────────────────────────
PostgreSQL performance optimization involves multiple layers...
[Detailed report with inline citations and technical insights]
────────────────────────────────────────────────────────
```

## Architecture

### Core Components

- **`src/agent.ts`** - Agent decision-making functions (evaluate, generate queries, decide continuation)
- **`src/llm.ts`** - OpenAI integration and report synthesis
- **`src/api.ts`** - Hacker News API integration via Algolia
- **`src/workflows.ts`** - Main research workflow orchestration  
- **`src/cli.ts`** - Command-line interface and output formatting

### Research Workflow

1. **Initial Search**: Starts with your provided topic
2. **Content Analysis**: Evaluates stories and comments for relevance and insights
3. **Query Generation**: AI generates diverse follow-up queries exploring different aspects
4. **Continuation Decision**: AI decides whether more research is needed
5. **Report Synthesis**: Combines all findings into a comprehensive narrative report

## Configuration

### Environment Variables
- `OPENAI_API_KEY` - Your OpenAI API key (required)

### CLI Options
- `--max-iterations NUM` - Maximum research iterations (default: 8)
- `--help` - Show help message

## Examples

### Technology Research
```bash
npm start "GraphQL vs REST API"
npm start "Kubernetes deployment strategies"
npm start "TypeScript performance tips"
```

### Tool Comparisons
```bash
npm start "Docker vs Podman"
npm start "Redis vs Memcached"
npm start "MySQL vs PostgreSQL"
```

### Best Practices
```bash
npm start "Node.js security best practices"
npm start "React testing strategies"
npm start "Database indexing techniques"
```

## Development

### Project Structure
```
src/
├── agent.ts      # Agent decision-making logic
├── api.ts        # Hacker News API integration
├── cli.ts        # Command-line interface
├── index.ts      # Entry point
├── llm.ts        # OpenAI integration
└── workflows.ts  # Research workflow orchestration
```

### Running in Development
```bash
npm run build
npm start "your topic"
```

### Building
```bash
npm run build
```

## How It Works

The agent uses a sophisticated multi-step process:

1. **Search Phase**: Queries Hacker News Algolia API for relevant stories
2. **Analysis Phase**: Reads comments from top stories to gather community insights
3. **Evaluation Phase**: AI evaluates content for technical details, tools, and key insights
4. **Planning Phase**: AI generates follow-up queries to explore unexplored aspects
5. **Decision Phase**: AI decides whether to continue based on relevance and completeness
6. **Synthesis Phase**: AI combines all findings into a coherent research report

The agent is designed to be thorough, exploring multiple angles of a topic while avoiding repetitive searches.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details