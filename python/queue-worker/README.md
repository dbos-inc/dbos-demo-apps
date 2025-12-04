# DBOS Queue Worker

This example app demonstrates the "queue worker" architecture.
This is a common pattern where you implement DBOS durable workflows in their own service and use a DBOS Client to enqueue, manage, and monitor workflows from other services.

## Setup

1. Install dependencies.

```shell
uv sync
```

2. Start your app.
This includes both a FastAPI web server (`server.py`) and a DBOS queue worker (`worker.py`).

```shell
./launch_app.sh
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!

