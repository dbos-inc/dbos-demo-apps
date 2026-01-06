import asyncio
from typing import Annotated

from annotated_types import MaxLen
from pydantic import BaseModel, ConfigDict
from pydantic_ai import Agent, RunContext, WebSearchTool, format_as_xml
from pydantic_ai.agent import AbstractAgent


class WebSearchStep(BaseModel):
    """A step that performs a web search.

    And returns a summary of the search results.
    """

    search_terms: str


class DeepResearchPlan(BaseModel, **ConfigDict(use_attribute_docstrings=True)):
    """A structured plan for deep research."""

    executive_summary: str
    """A summary of the research plan."""

    web_search_steps: Annotated[list[WebSearchStep], MaxLen(5)]
    """A list of web search steps to perform to gather raw information."""

    analysis_instructions: str
    """The analysis step to perform after all web search steps are completed."""


plan_agent = Agent(
    'anthropic:claude-sonnet-4-5',
    instructions='Analyze the users query and design a plan for deep research to answer their query.',
    output_type=DeepResearchPlan,
    name='abstract_plan_agent',
)


search_agent = Agent(
    'google-gla:gemini-2.5-flash',
    instructions='Perform a web search for the given terms and return a detailed report on the results.',
    builtin_tools=[WebSearchTool()],
    name='search_agent',
)

analysis_agent = Agent(
    'anthropic:claude-sonnet-4-5',
    deps_type=AbstractAgent,
    instructions="""
Analyze the research from the previous steps and generate a report on the given subject.

If the search results do not contain enough information, you may perform further searches using the
`extra_search` tool.
""",
    name='analysis_agent',
)


@analysis_agent.tool
async def extra_search(ctx: RunContext[AbstractAgent], query: str) -> str:
    """Perform an extra search for the given query."""
    result = await ctx.deps.run(query)
    return result.output


async def deep_research(query: str) -> str:
    result = await plan_agent.run(query)
    plan = result.output
    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(search_agent.run(step.search_terms)) for step in plan.web_search_steps]

    search_results = [task.result().output for task in tasks]

    analysis_result = await analysis_agent.run(
        format_as_xml(
            {
                'query': query,
                'search_results': search_results,
                'instructions': plan.analysis_instructions,
            }
        ),
        deps=search_agent,
    )
    print(analysis_result.output)
    return analysis_result.output


if __name__ == '__main__':
    asyncio.run(deep_research('Find me a list of hedge funds that write python in London'))
