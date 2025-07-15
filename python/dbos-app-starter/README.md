# Welcome to DBOS!

This example app demonstrates the durability of DBOS workflows.

## Setup

1. Install dependencies and activate your virtual environment

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install dbos
```

2. Start Postgres in a local Docker container:

```bash
dbos postgres start
```

If you already use Postgres, you can set the `DBOS_DATABASE_URL` environment variable to your connection string.

3. Start your app:

```shell
python3 app/main.py
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!

Then check out the [programming guide](https://docs.dbos.dev/python/programming-guide) to learn more about building with DBOS.
