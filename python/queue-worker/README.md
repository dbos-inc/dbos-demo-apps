# DBOS Queue Worker

This example demonstrates how to build DBOS workflows in their own "queue worker" service and enqueue and manage them from other services.

## Setup

1. Install dependencies:

```shell
uv sync
```

2. Start both services in this example: a FastAPI web server (`server.py`) and a DBOS worker (`worker.py`):

```shell
./launch_app.sh
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!

