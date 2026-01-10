import asyncio
import os
import sys
from datetime import datetime
from typing import Annotated, List, Optional

import uvicorn
from annotated_types import MaxLen
from dbos import DBOS, DBOSConfig, WorkflowHandleAsync
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from pydantic_ai import Agent, WebSearchTool, format_as_xml
from pydantic_ai.durable_exec.dbos import DBOSAgent

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Validate required environment variables
model_prefix = ""

if os.environ.get("PYDANTIC_AI_GATEWAY_API_KEY"):
    model_prefix = "gateway/"
    print("Using Pydantic AI Gateway for model access")
else:
    print("PYDANTIC_AI_GATEWAY_API_KEY environment variable not set, using providers directly")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("❌ Error: ANTHROPIC_API_KEY environment variable not set")
        sys.exit(1)
    if not os.environ.get("GOOGLE_API_KEY"):
        print("❌ Error: GOOGLE_API_KEY environment variable not set")
        sys.exit(1)

class WebSearchStep(BaseModel):
    """A step that performs a web search.

    And returns a summary of the search results.
    """

    search_terms: str


class DeepResearchPlan(BaseModel, **ConfigDict(use_attribute_docstrings=True)):
    """A structured plan for deep research."""

    summary: str
    """A summary of the research plan."""

    web_search_steps: Annotated[list[WebSearchStep], MaxLen(5)]
    """A list of web search steps to perform to gather raw information."""

    analysis_instructions: str
    """The analysis step to perform after all web search steps are completed."""


plan_agent = Agent(
    f"{model_prefix}anthropic:claude-sonnet-4-5",
    instructions="Analyze the users query and design a plan for deep research to answer their query.",
    output_type=DeepResearchPlan,
    name="plan_agent",
)


search_agent = Agent(
    f"{model_prefix}google-vertex:gemini-2.5-flash",
    instructions="Perform a web search for the given terms and return a detailed report on the results.",
    builtin_tools=[WebSearchTool()],
    name="search_agent",
)

analysis_agent = Agent(
    f"{model_prefix}anthropic:claude-sonnet-4-5",
    instructions="""
Analyze the research from the previous steps and generate a report on the given subject.

If the search results do not contain enough information, you may perform further searches using the
`extra_search` tool.

Your report should start with an executive summary of the results, then a concise analysis of the findings.

Include links to original sources whenever possible.
""",
    name="analysis_agent",
)

AGENT_STATUS = "agent_status"


class AgentStartRequest(BaseModel):
    query: str


class AgentStatus(BaseModel):
    created_at: str
    query: str
    report: Optional[str]
    status: str
    agent_id: str = ""


@analysis_agent.tool_plain
async def extra_search(query: str) -> str:
    """Perform an extra search for the given query."""
    result = await search_agent.run(query)
    return result.output


dbos_plan_agent = DBOSAgent(plan_agent)
dbos_search_agent = DBOSAgent(search_agent)
dbos_analysis_agent = DBOSAgent(analysis_agent)


@DBOS.workflow()
async def search_workflow(search_terms: str) -> str:
    result = await dbos_search_agent.run(search_terms)
    return result.output


@DBOS.workflow()
async def deep_research(query: str) -> str:
    # Set and update an agent status the frontend can display
    agent_status = AgentStatus(
        created_at=datetime.now().isoformat(),
        query=query,
        report=None,
        status="PENDING",
    )
    DBOS.set_event(AGENT_STATUS, agent_status)
    result = await dbos_plan_agent.run(query)
    plan = result.output
    tasks_handles: List[WorkflowHandleAsync[str]] = []
    for step in plan.web_search_steps:
        # Asynchronously start search workflows without waiting for each to complete
        task_handle = await DBOS.start_workflow_async(
            search_workflow, step.search_terms
        )
        tasks_handles.append(task_handle)

    search_results = [await task.get_result() for task in tasks_handles]

    analysis_result = await dbos_analysis_agent.run(
        format_as_xml(
            {
                "query": query,
                "search_results": search_results,
                "instructions": plan.analysis_instructions,
            }
        ),
    )
    agent_status.report = analysis_result.output
    DBOS.set_event(AGENT_STATUS, agent_status)
    return analysis_result.output


@app.post("/agents")
async def start_agent(request: AgentStartRequest):
    # Start a durable agent in the background
    DBOS.start_workflow(deep_research, request.query)
    return {"ok": True}


@app.get("/agents", response_model=list[AgentStatus])
async def list_agents():
    # List all active agents and retrieve their statuses
    agent_workflows = await DBOS.list_workflows_async(
        name=deep_research.__qualname__,
        sort_desc=True,
    )
    statuses: list[AgentStatus] = await asyncio.gather(
        *[DBOS.get_event_async(w.workflow_id, AGENT_STATUS) for w in agent_workflows]
    )
    for workflow, status in zip(agent_workflows, statuses):
        status.status = workflow.status
        status.agent_id = workflow.workflow_id
    return statuses


if __name__ == "__main__":
    config: DBOSConfig = {
        "name": "pydantic-research-agent",
        "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
        "conductor_key": os.environ.get("DBOS_CONDUCTOR_KEY"),
    }
    DBOS(config=config)
    DBOS.launch()
    uvicorn.run(app, host="0.0.0.0", port=8000)
