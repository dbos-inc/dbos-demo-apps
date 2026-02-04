# Responses API Agent


To deploy:

```
databricks apps create agent-openai-agents-sdk
DATABRICKS_USERNAME=$(databricks current-user me | jq -r .userName)
databricks sync . "/Users/$DATABRICKS_USERNAME/agent-openai-agents-sdk"
databricks bundle deploy -t prod
databricks bundle run agent_openai_agents_sdk -t prod
```