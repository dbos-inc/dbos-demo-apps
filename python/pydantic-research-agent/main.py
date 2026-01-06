import asyncio
import sys
import uuid
from typing import Annotated, List

from annotated_types import MaxLen
from dbos import DBOS, DBOSConfig, SetWorkflowID, WorkflowHandleAsync
from pydantic import BaseModel, ConfigDict
from pydantic_ai import Agent, WebSearchTool, format_as_xml
from pydantic_ai.durable_exec.dbos import DBOSAgent


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
    'anthropic:claude-sonnet-4-5',
    instructions='Analyze the users query and design a plan for deep research to answer their query.',
    output_type=DeepResearchPlan,
    name='plan_agent',
)


search_agent = Agent(
    'google-gla:gemini-2.5-flash',
    instructions='Perform a web search for the given terms and return a detailed report on the results.',
    builtin_tools=[WebSearchTool()],
    name='search_agent',
)

analysis_agent = Agent(
    'anthropic:claude-sonnet-4-5',
    instructions="""
Analyze the research from the previous steps and generate a report on the given subject.

If the search results do not contain enough information, you may perform further searches using the
`extra_search` tool.

Your report should start with an executive summary of the results, then a concise analysis of the findings.

Include links to original sources whenever possible.
""",
    name='analysis_agent',
)


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
    result = await dbos_plan_agent.run(query)
    plan = result.output
    tasks_handles: List[WorkflowHandleAsync[str]] = []
    for step in plan.web_search_steps:
        # Asynchronously start search workflows without waiting for each to complete
        task_handle = await DBOS.start_workflow_async(search_workflow, step.search_terms)
        tasks_handles.append(task_handle)

    search_results = [await task.get_result() for task in tasks_handles]

    analysis_result = await dbos_analysis_agent.run(
        format_as_xml(
            {
                'query': query,
                'search_results': search_results,
                'instructions': plan.analysis_instructions,
            }
        ),
    )
    return analysis_result.output


async def deep_research_durable(query: str):
    config: DBOSConfig = {
        'name': 'deep_research_durable',
        'enable_otlp': True,
        'system_database_url': 'postgresql://postgres@localhost:5432/dbos',
    }
    DBOS(config=config)
    DBOS.launch()
    resume_id = sys.argv[1] if len(sys.argv) > 1 else None
    wf_id = f'deep-research-{uuid.uuid4()}'
    if resume_id is not None:
        print('resuming existing workflow', resume_id)
        wf_id = resume_id
    else:
        print('starting new workflow', wf_id)

    with SetWorkflowID(wf_id):
        summary = await deep_research(query)

    print(summary)


if __name__ == '__main__':
    asyncio.run(
        deep_research_durable(
            'Whats the best Python agent framework to use if I care about durable execution and type safety?'
        )
    )
