import sys

from databricks.sdk import WorkspaceClient

# TODO: Replace with your deployed agent endpoint name
DEFAULT_ENDPOINT = "default-schema-databricks_agent"

endpoint = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ENDPOINT

client = WorkspaceClient().serving_endpoints.get_open_ai_client()

response = client.responses.create(
    model=endpoint,
    input=[{"role": "user", "content": "What is 5+5?"}],
    stream=True,
)

for event in response:
    print(event)
