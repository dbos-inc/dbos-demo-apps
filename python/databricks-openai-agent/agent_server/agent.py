import math
from typing import AsyncGenerator

from dbos import DBOS
import mlflow
from agents import Agent, function_tool, set_default_openai_api, set_default_openai_client
from dbos_openai_agents import DBOSRunner
from agents.tracing import set_trace_processors
from databricks_openai import AsyncDatabricksOpenAI
from mlflow.genai.agent_server import invoke, stream
from mlflow.types.responses import (
    ResponsesAgentRequest,
    ResponsesAgentResponse,
    ResponsesAgentStreamEvent,
)


# NOTE: this will work for all databricks models OTHER than GPT-OSS, which uses a slightly different API
set_default_openai_client(AsyncDatabricksOpenAI())
set_default_openai_api("chat_completions")
set_trace_processors([])  # only use mlflow for trace processing
mlflow.openai.autolog()


@function_tool
@DBOS.step()
def add(a: float, b: float) -> str:
    """Add two numbers together."""
    result = a + b
    return f"{a} + {b} = {result}"


@function_tool
@DBOS.step()
def subtract(a: float, b: float) -> str:
    """Subtract b from a."""
    result = a - b
    return f"{a} - {b} = {result}"


@function_tool
@DBOS.step()
def multiply(a: float, b: float) -> str:
    """Multiply two numbers together."""
    result = a * b
    return f"{a} * {b} = {result}"


@function_tool
@DBOS.step()
def divide(a: float, b: float) -> str:
    """Divide a by b."""
    if b == 0:
        return "Error: division by zero"
    result = a / b
    return f"{a} / {b} = {result}"


@function_tool
@DBOS.step()
def power(base: float, exponent: float) -> str:
    """Raise base to the power of exponent."""
    result = math.pow(base, exponent)
    return f"{base} ^ {exponent} = {result}"


@function_tool
@DBOS.step()
def sqrt(a: float) -> str:
    """Compute the square root of a number."""
    if a < 0:
        return "Error: cannot take square root of a negative number"
    result = math.sqrt(a)
    return f"sqrt({a}) = {result}"


@function_tool
@DBOS.step()
def modulo(a: float, b: float) -> str:
    """Compute a modulo b (the remainder of a divided by b)."""
    if b == 0:
        return "Error: division by zero"
    result = a % b
    return f"{a} % {b} = {result}"


@function_tool
@DBOS.step()
def factorial(n: int) -> str:
    """Compute the factorial of a non-negative integer."""
    if n < 0:
        return "Error: factorial is not defined for negative numbers"
    result = math.factorial(n)
    return f"{n}! = {result}"


def create_agent() -> Agent:
    return Agent(
        name="calculator assistant",
        instructions=(
            "You are a calculator assistant. You solve math problems by breaking them "
            "down into individual operations using your tools. Always use tools for "
            "arithmetic — never compute results yourself. For complex expressions, "
            "chain multiple tool calls step by step, using the result of one as input "
            "to the next. Show your work clearly."
        ),
        model="databricks-gpt-5-2",
        tools=[add, subtract, multiply, divide, power, sqrt, modulo, factorial],
    )

@DBOS.workflow()
async def run_agent(messages):
    agent = create_agent()
    result = await DBOSRunner.run(agent, messages)
    return [item.to_input_item() for item in result.new_items]


@invoke()
async def invoke(request: ResponsesAgentRequest) -> ResponsesAgentResponse:
    # Optionally use the user's workspace client for on-behalf-of authentication
    # user_workspace_client = get_user_workspace_client()
    messages = [i.model_dump() for i in request.input]
    result = await run_agent(messages)
    return ResponsesAgentResponse(output=result)


@stream()
async def stream(request: dict) -> AsyncGenerator[ResponsesAgentStreamEvent, None]:
    messages = [i.model_dump() for i in request.input]
    result = await run_agent(messages)
    for item in result:
        yield {"type": "response.output_item.done", "item": item}
    yield {"type": "response.completed", "response": {"output": result}}
