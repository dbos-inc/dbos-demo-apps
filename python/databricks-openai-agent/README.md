# DBOS Databricks Agent

This example shows you how to build a durable agent using DBOS and the OpenAI Agents SDK and deploy it to Databricks, using Lakebase as a durable store.

## Connecting to Lakebase

Follow [this guide](https://docs.dbos.dev/integrations/lakebase?auth=password) using Native Postgres Password Authentication to retrieve a connection string for your Lakebase database.
Export it to an environment variable:


```
export DBOS_SYSTEM_DATABASE_URL="<your connection string>"
```

## Running Locally

Install the Databricks CLI and authenticate:

```
databricks auth login
```

Then start the app:

```
uv run start-app
```

You can see your app at http://localhost:8000!

## Deploying to Databricks

After verifying the app works locally, run the following commands:

```
databricks apps create agent-openai-agents-sdk
databricks bundle deploy -t prod \
  --var dbos_system_database_url=$DBOS_SYSTEM_DATABASE_URL \
  --var databricks_lakebase_endpoint=$DATABRICKS_LAKEBASE_ENDPOINT
databricks bundle run agent_openai_agents_sdk -t prod
```