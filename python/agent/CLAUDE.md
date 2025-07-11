# DBOS Agentic Hacker News Research Agent Plan

## Project Overview
Build a CLI-based **agentic research agent** using DBOS that autonomously researches topics on Hacker News using LLM-powered decision making and multi-step workflows. No persistent storage - pure agentic intelligence.

## Architecture

### Module Structure
```
hacker_news_agent/
├── __init__.py
├── api.py          # HN Algolia API integration
├── llm.py          # LLM integration and agentic logic
├── agent.py        # Core agent decision making
├── workflows.py    # DBOS agentic workflows
└── cli.py         # CLI interface
```

### Core Components

#### 1. API Layer (`api.py`)
- `search_hackernews_step()` - Search stories using Algolia
- `get_story_details_step()` - Get detailed story info
- `get_comments_step()` - Fetch comments for stories

#### 2. LLM Layer (`llm.py`)
- `llm_call_step()` - Core LLM API integration
- `analyze_content_step()` - LLM content analysis
- `generate_queries_step()` - LLM-powered query generation
- `synthesize_findings_step()` - LLM synthesis of research

#### 3. Agent Layer (`agent.py`)
- `plan_research_step()` - Agent creates research plan
- `evaluate_results_step()` - Agent evaluates findings and decides next steps
- `generate_follow_ups_step()` - Agent generates follow-up research directions
- `should_continue_step()` - Agent decides if more research is needed

#### 4. Workflow Layer (`workflows.py`)
- `agentic_research_workflow()` - Main autonomous research workflow
- `research_iteration_workflow()` - Single research iteration
- `content_analysis_workflow()` - Deep content analysis sub-workflow

#### 5. CLI Interface (`cli.py`)
- Command-line argument parsing
- Real-time agent progress display
- Output formatting (text/JSON)
- Error handling

## Dependencies (uv)
- `dbos` - Core DBOS framework
- `httpx` - HTTP client for API calls
- `openai` - LLM API integration
- `click` or `argparse` - CLI interface

## Key DBOS Features Demonstrated
1. **Durable Agentic Workflows** - Agent decisions persist across interruptions
2. **Step Isolation** - Each LLM call and API request is recoverable
3. **Workflow Composition** - Complex agent reasoning chains
4. **Error Handling** - Automatic retries for LLM and API failures
5. **Stateful Agent Memory** - Agent maintains context across workflow steps

## CLI Usage
```bash
# Autonomous agentic research (default behavior)
python -m hacker_news_agent.cli "artificial intelligence"

# Control agent depth (max iterations)
python -m hacker_news_agent.cli "blockchain" --max-iterations 5

# JSON output for programmatic use
python -m hacker_news_agent.cli "python frameworks" --json

# Verbose mode to see agent reasoning
python -m hacker_news_agent.cli "startup funding" --verbose
```

## Agentic Implementation Flow

### Core Agent Loop
1. **Planning Phase**: Agent analyzes topic and creates research plan
2. **Execution Phase**: Agent executes searches and gathers data
3. **Analysis Phase**: Agent analyzes findings and extracts insights
4. **Decision Phase**: Agent decides if more research is needed
5. **Iteration**: Agent generates new queries and repeats (up to max iterations)
6. **Synthesis Phase**: Agent synthesizes all findings into final report

### Detailed Agent Steps
1. **Initial Planning**: LLM creates structured research plan with key questions
2. **Search Execution**: Execute searches based on agent-generated queries
3. **Content Evaluation**: Agent evaluates relevance and quality of found content
4. **Deep Dive Decision**: Agent decides which stories/comments need deeper analysis
5. **Follow-up Generation**: Agent generates new search queries based on findings
6. **Synthesis**: Agent combines all research into comprehensive report
7. **Quality Assessment**: Agent evaluates completeness and suggests improvements

## Agentic Features

### LLM-Powered Decision Making
- **Query Refinement**: LLM analyzes initial results and suggests refined searches
- **Content Prioritization**: LLM determines which stories/comments are most relevant
- **Research Direction**: LLM decides what aspects need deeper investigation
- **Synthesis**: LLM combines multiple data sources into coherent insights

### Multi-Step Research Chain
```
Initial Query → LLM Analysis → Follow-up Queries → Content Analysis → Synthesis → Report
```

### Example Agentic Flow
**User Input**: "AI startups"

**Agent Iteration 1**:
- Agent plans: "Research AI startup funding, recent launches, and market trends"
- Searches: "AI startups 2024", "AI funding", "AI IPO"
- Finds: Stories about OpenAI, Anthropic, startup valuations
- Agent decides: "Need to understand regulatory landscape affecting these companies"

**Agent Iteration 2**:
- Agent searches: "AI regulation", "AI safety policy", "AI legislation"
- Finds: Policy discussions, regulatory concerns, compliance issues
- Agent decides: "Should analyze community sentiment on these regulations"

**Agent Iteration 3**:
- Agent analyzes comments on controversial AI policy stories
- Extracts sentiment and key concerns from developer/founder community
- Agent decides: "Sufficient information gathered"

**Final Synthesis**:
- Agent produces comprehensive report covering:
  - Current AI startup landscape and funding trends
  - Regulatory environment and its impact on startups
  - Community sentiment and concerns
  - Emerging opportunities and challenges

## Next Steps
1. Create project structure with proper Python modules
2. Configure uv dependencies
3. Implement API integration with DBOS steps
4. Build analysis logic
5. Create workflows
6. Implement CLI interface
7. Test and refine