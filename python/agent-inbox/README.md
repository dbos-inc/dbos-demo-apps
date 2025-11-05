# Agent Inbox

This app shows how to build durable human-in-the-loop agents with DBOS.
As agents run, they require manual human approval for key steps.
From this app's dashboard, see which agentic tasks need approval and approve or deny them.

To see how it works and how you can adapt this pattern to build your own durable agents, check out the agent code in `main.py`.

# Run the App

1. Install dependencies

```
uv sync
```

2. (Optional) Connect to Postgres. DBOS can connect to either SQLite or Postgres.
SQLite is the default for development, but you can connect to Postgres by setting your `DBOS_SYSTEM_DATABASE_URL` environment variable to a connection string to your Postgres database.

```
export DBOS_SYSTEM_DATABASE_URL=...
```

3. Start your app:

```
./launch_app.sh
```

This launches both the Python backend and the React frontend.
Check out your app at [http://localhost:5173](http://localhost:5173)!