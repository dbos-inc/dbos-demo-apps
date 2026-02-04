# Responses API Agent

To run locally:

```
uv run start-app
```

To deploy:

```
databricks apps create agent-openai-agents-sdk
databricks bundle deploy -t prod
databricks bundle run agent_openai_agents_sdk -t prod
```