import math
from typing import AsyncGenerator

import mlflow
from agents import Agent, Runner, function_tool, set_default_openai_api, set_default_openai_client
from agents.tracing import set_trace_processors
from databricks_openai import AsyncDatabricksOpenAI
from mlflow.genai.agent_server import invoke, stream
from mlflow.types.responses import (
    ResponsesAgentRequest,
    ResponsesAgentResponse,
    ResponsesAgentStreamEvent,
)

from agent_server.utils import (
    process_agent_stream_events,
)

# NOTE: this will work for all databricks models OTHER than GPT-OSS, which uses a slightly different API
set_default_openai_client(AsyncDatabricksOpenAI())
set_default_openai_api("chat_completions")
set_trace_processors([])  # only use mlflow for trace processing
mlflow.openai.autolog()


@function_tool
def add(a: float, b: float) -> str:
    """Add two numbers together."""
    result = a + b
    return f"{a} + {b} = {result}"


@function_tool
def subtract(a: float, b: float) -> str:
    """Subtract b from a."""
    result = a - b
    return f"{a} - {b} = {result}"


@function_tool
def multiply(a: float, b: float) -> str:
    """Multiply two numbers together."""
    result = a * b
    return f"{a} * {b} = {result}"


@function_tool
def divide(a: float, b: float) -> str:
    """Divide a by b."""
    if b == 0:
        return "Error: division by zero"
    result = a / b
    return f"{a} / {b} = {result}"


@function_tool
def power(base: float, exponent: float) -> str:
    """Raise base to the power of exponent."""
    result = math.pow(base, exponent)
    return f"{base} ^ {exponent} = {result}"


@function_tool
def sqrt(a: float) -> str:
    """Compute the square root of a number."""
    if a < 0:
        return "Error: cannot take square root of a negative number"
    result = math.sqrt(a)
    return f"sqrt({a}) = {result}"


@function_tool
def modulo(a: float, b: float) -> str:
    """Compute a modulo b (the remainder of a divided by b)."""
    if b == 0:
        return "Error: division by zero"
    result = a % b
    return f"{a} % {b} = {result}"


@function_tool
def factorial(n: int) -> str:
    """Compute the factorial of a non-negative integer."""
    if n < 0:
        return "Error: factorial is not defined for negative numbers"
    if n > 170:
        return "Error: number too large for factorial"
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


@invoke()
async def invoke(request: ResponsesAgentRequest) -> ResponsesAgentResponse:
    # Optionally use the user's workspace client for on-behalf-of authentication
    # user_workspace_client = get_user_workspace_client()
    agent = create_agent()
    messages = [i.model_dump() for i in request.input]
    result = await Runner.run(agent, messages)
    return ResponsesAgentResponse(output=[item.to_input_item() for item in result.new_items])


@stream()
async def stream(request: dict) -> AsyncGenerator[ResponsesAgentStreamEvent, None]:
    agent = create_agent()
    messages = [i.model_dump() for i in request.input]
    result = await Runner.run(agent, messages)
    for item in result.new_items:
        output_item = item.to_input_item()
        yield {"type": "response.output_item.done", "item": output_item}
    yield {"type": "response.completed"}
