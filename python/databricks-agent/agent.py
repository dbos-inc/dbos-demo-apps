import json
from datetime import datetime, timezone
from typing import Any, Generator

import mlflow
from databricks.sdk import WorkspaceClient
from mlflow.entities import SpanType
from mlflow.pyfunc import ResponsesAgent
from mlflow.types.responses import (
    ResponsesAgentRequest,
    ResponsesAgentResponse,
    ResponsesAgentStreamEvent,
)

# TODO: Replace with your model serving endpoint
LLM_ENDPOINT_NAME = "databricks-claude-sonnet-4-5"

SYSTEM_PROMPT = """
You are a helpful assistant that provides brief, clear responses.
You have access to tools. Use them when the user's question requires it.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_date",
            "description": "Get the current date and time in UTC.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


def execute_tool(name: str, args: dict[str, Any]) -> str:
    if name == "get_current_date":
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    raise ValueError(f"Unknown tool: {name}")


class ToolCallingAgent(ResponsesAgent):
    """
    Chat agent with tool calling. Calls an LLM via the Databricks OpenAI
    client, executes tool calls in a loop, and returns the final response.
    """

    def __init__(self):
        self.client = WorkspaceClient().serving_endpoints.get_open_ai_client()

    @mlflow.trace(span_type=SpanType.LLM)
    def call_llm(self, messages: list[dict[str, Any]]) -> Any:
        return self.client.chat.completions.create(
            model=LLM_ENDPOINT_NAME,
            messages=messages,
            tools=TOOLS,
        )

    @mlflow.trace(span_type=SpanType.TOOL)
    def call_tool(self, name: str, args: dict[str, Any]) -> str:
        return execute_tool(name, args)

    @mlflow.trace(span_type=SpanType.AGENT)
    def predict(self, request: ResponsesAgentRequest) -> ResponsesAgentResponse:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for item in request.input:
            messages.append(item.model_dump())

        output_items = []

        for _ in range(10):  # max iterations to prevent infinite loops
            response = self.call_llm(messages)
            choice = response.choices[0]

            if choice.finish_reason == "tool_calls":
                tool_calls = choice.message.tool_calls
                messages.append(choice.message.to_dict())

                for tc in tool_calls:
                    args = json.loads(tc.function.arguments)
                    result = self.call_tool(tc.function.name, args)

                    output_items.append(
                        self.create_function_call_item(
                            id=tc.id,
                            call_id=tc.id,
                            name=tc.function.name,
                            arguments=tc.function.arguments,
                        )
                    )
                    output_items.append(
                        self.create_function_call_output_item(
                            call_id=tc.id,
                            output=result,
                        )
                    )

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    })
            else:
                text = choice.message.content or ""
                output_items.append(
                    self.create_text_output_item(text=text, id="msg_final")
                )
                break

        return ResponsesAgentResponse(
            output=output_items,
            custom_outputs=request.custom_inputs,
        )

    def predict_stream(
        self, request: ResponsesAgentRequest
    ) -> Generator[ResponsesAgentStreamEvent, None, None]:
        result = self.predict(request)
        for item in result.output:
            yield ResponsesAgentStreamEvent(
                type="response.output_item.done",
                item=item,
            )


mlflow.openai.autolog()
AGENT = ToolCallingAgent()
mlflow.models.set_model(AGENT)

if __name__ == "__main__":
    response = AGENT.predict(
        {"input": [{"role": "user", "content": "What is today's date?"}]}
    )
    print(response.model_dump(exclude_none=True))
