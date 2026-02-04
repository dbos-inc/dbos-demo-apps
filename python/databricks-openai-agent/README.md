# DBOS Databricks Agent

This example shows you how to build a durable agent using DBOS and the OpenAI Agents SDK and deploy it to Databricks, using Lakebase as a durable store.
With durable execution, you can build reliable agents that preserve progress across transient API failures, application errors, and restarts, while also handling long-running, asynchronous, and human-in-the-loop workflows with production-grade reliability.

You can follow this pattern to add durability to any agent that is [deployed as a Databricks app](https://docs.databricks.com/aws/en/generative-ai/agent-framework/author-agent-db-app).

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
The example is a calculator app that demonstrates agentic tool-calling. For example, prompt it with "What is (8 * 4! + 2)?"

## Deploying to Databricks

First, store your database URL in a Databricks secret scope:

```
databricks secrets create-scope dbos-secrets
databricks secrets put-secret dbos-secrets DBOS_SYSTEM_DATABASE_URL --string-value "$DBOS_SYSTEM_DATABASE_URL"
```

Then deploy:

```
databricks apps create agent-openai-agents-sdk
databricks bundle deploy -t prod
databricks bundle run agent_openai_agents_sdk -t prod
```

You should see the URL for your app hosted on Databricks!
The example is a calculator app that demonstrates agentic tool-calling. For example, prompt it with "What is (8 * 4! + 2)?"
