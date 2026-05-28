import asyncio
import os
import sys
from datetime import datetime
from typing import Annotated, List, Optional

import logfire
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

# Enable Logfire instrumentation if LOGFIRE_TOKEN is set
enable_logfire = False
if os.environ.get("LOGFIRE_TOKEN"):
    print("Enabling Logfire instrumentation")
    enable_logfire = True
    logfire.configure(service_name="pydantic-research-agent")
    logfire.instrument_pydantic_ai()

# Validate required environment variables
model_prefix = ""

if os.environ.get("PYDANTIC_AI_GATEWAY_API_KEY"):
    model_prefix = "gateway/"
    print("Using Pydantic AI Gateway for model access")
else:
    print(
        "PYDANTIC_AI_GATEWAY_API_KEY environment variable not set, using providers directly"
    )
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
    f"{model_prefix}google-gla:gemini-2.5-flash",
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
APPROVAL_TOPIC = "approval"


class AgentStartRequest(BaseModel):
    query: str


class ApprovalRequest(BaseModel):
    action: str  # "finish" or "research_more"
    prompt: Optional[str] = None


class SearchStepStatus(BaseModel):
    search_terms: str
    completed: bool = False


class AgentStatus(BaseModel):
    created_at: str
    query: str
    report: Optional[str]
    status: str
    search_steps: List[SearchStepStatus] = []
    agent_id: str = ""


dbos_plan_agent = DBOSAgent(plan_agent)
dbos_search_agent = DBOSAgent(search_agent)
dbos_analysis_agent = DBOSAgent(analysis_agent)

@analysis_agent.tool_plain
async def extra_search(query: str) -> str:
    """Perform an extra search for the given query."""
    result = await dbos_search_agent.run(query)
    return result.output

@DBOS.workflow()
async def search_workflow(search_terms: str) -> str:
    result = await dbos_search_agent.run(search_terms)
    return result.output


@DBOS.workflow()
async def deep_research(query: str) -> str:
    created_at = datetime.now().isoformat()
    current_query = query
    display_query = query  # User-facing label; updated each iteration
    current_report: Optional[str] = None

    while True:
        agent_status = AgentStatus(
            created_at=created_at,
            query=display_query,
            report=current_report,
            status="PLANNING",
        )
        await DBOS.set_event_async(AGENT_STATUS, agent_status)
        result = await dbos_plan_agent.run(current_query)
        plan = result.output
        tasks_handles: List[WorkflowHandleAsync[str]] = []

        agent_status.status = "SEARCHING"
        agent_status.search_steps = [
            SearchStepStatus(search_terms=step.search_terms)
            for step in plan.web_search_steps
        ]
        await DBOS.set_event_async(AGENT_STATUS, agent_status)
        for step in plan.web_search_steps:
            task_handle = await DBOS.start_workflow_async(
                search_workflow, step.search_terms
            )
            tasks_handles.append(task_handle)

        search_results = []
        for i, task in enumerate(tasks_handles):
            search_results.append(await task.get_result())
            agent_status.search_steps[i].completed = True
            await DBOS.set_event_async(AGENT_STATUS, agent_status)

        agent_status.status = "ANALYZING"
        await DBOS.set_event_async(AGENT_STATUS, agent_status)
        analysis_result = await dbos_analysis_agent.run(
            format_as_xml(
                {
                    "query": current_query,
                    "search_results": search_results,
                    "instructions": plan.analysis_instructions,
                }
            ),
        )
        current_report = analysis_result.output
        agent_status.report = current_report
        agent_status.status = "PENDING_APPROVAL"
        await DBOS.set_event_async(AGENT_STATUS, agent_status)

        # Wait for the user to finish or request more research (up to 1 hour)
        approval = await DBOS.recv_async(APPROVAL_TOPIC, timeout_seconds=3600)

        if approval is None or approval.get("action") == "finish":
            agent_status.status = "COMPLETED"
            await DBOS.set_event_async(AGENT_STATUS, agent_status)
            return current_report

        # Research more: build a context-aware query for the next iteration
        additional_prompt = approval.get("prompt") or ""
        display_query = additional_prompt
        current_query = (
            f"<previous_research_summary>\n{current_report}\n</previous_research_summary>\n\n"
            f"Additional research requested: {additional_prompt}"
        )


@app.post("/agents")
async def start_agent(request: AgentStartRequest):
    # Start a durable agent in the background
    DBOS.start_workflow(deep_research, request.query)
    return {"ok": True}


@app.post("/agents/{agent_id}/approve")
async def approve_agent(agent_id: str, request: ApprovalRequest):
    await DBOS.send_async(agent_id, {"action": request.action, "prompt": request.prompt}, APPROVAL_TOPIC)
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
        status.status = workflow.status if workflow.status == "ERROR" or workflow.status == "CANCELLED" else status.status
        status.agent_id = workflow.workflow_id
        if not hasattr(status, "search_steps") or status.search_steps is None:
            status.search_steps = []
        elif status.search_steps and isinstance(status.search_steps[0], str):
            status.search_steps = [
                SearchStepStatus(search_terms=s, completed=True)
                for s in status.search_steps
            ]
    return statuses


if __name__ == "__main__":
    config: DBOSConfig = {
        "name": "pydantic-research-agent",
        "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
        "conductor_key": os.environ.get("DBOS_CONDUCTOR_KEY"),
        "enable_otlp": enable_logfire,
        "application_version": "0.1.0",
    }
    DBOS(config=config)
    DBOS.launch()
    uvicorn.run(app, host="0.0.0.0", port=8000, log_config=None)
