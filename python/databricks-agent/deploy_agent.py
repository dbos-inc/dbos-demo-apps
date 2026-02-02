import mlflow
from databricks import agents
from mlflow.models.resources import DatabricksServingEndpoint

from agent import LLM_ENDPOINT_NAME

# TODO: Replace with your Unity Catalog model name (catalog.schema.model_name)
UC_MODEL_NAME = "workspace.default.databricks_agent"

resources = [
    DatabricksServingEndpoint(endpoint_name=LLM_ENDPOINT_NAME),
]

mlflow.set_registry_uri("databricks-uc")

with mlflow.start_run():
    logged_agent_info = mlflow.pyfunc.log_model(
        python_model="agent.py",
        artifact_path="agent",
        resources=resources,
        registered_model_name=UC_MODEL_NAME,
    )

print(f"Model URI: {logged_agent_info.model_uri}")
print(f"Model version: {logged_agent_info.registered_model_version}")

deployment = agents.deploy(
    model_name=UC_MODEL_NAME,
    model_version=logged_agent_info.registered_model_version,
    scale_to_zero_enabled=True,
)

print(f"Deployment endpoint: {deployment.query_endpoint}")
