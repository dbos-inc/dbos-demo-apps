import os
from dbos import DBOS, DBOSConfig
from dotenv import load_dotenv
from mlflow.genai.agent_server import AgentServer, setup_mlflow_git_based_version_tracking

# Load env vars from .env before importing the agent for proper auth
load_dotenv(dotenv_path=".env", override=True)

# Need to import the agent to register the functions with the server
import agent_server.agent  # noqa: E402

agent_server = AgentServer("ResponsesAgent", enable_chat_proxy=True)
# Define the app as a module level variable to enable multiple workers
app = agent_server.app  # noqa: F841
setup_mlflow_git_based_version_tracking()


def main():
    system_database_url = os.environ.get("DBOS_SYSTEM_DATABASE_URL")
    if not system_database_url:
        raise Exception("DBOS_SYSTEM_DATABASE_URL not found")
    config: DBOSConfig = {
        "name": "dbos-databricks-agent",
        "system_database_url": system_database_url,
        "conductor_key": os.environ.get("CONDUCTOR_KEY")
    }
    DBOS(config=config)
    DBOS.launch()
    agent_server.run(app_import_string="agent_server.start_server:app")
