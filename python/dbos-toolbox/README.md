# DBOS Toolbox

This app contains example code for many DBOS features, including workflows, steps, queues, scheduled workflows, and transactions.
You can use it as a template when starting a new DBOS app&mdash;start by editing `main.py`.

To learn more about how to program with DBOS, check out the [DBOS programming guide](https://docs.dbos.dev/python/programming-guide).

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

3. Run database migrations:

```shell
dbos migrate
```

4. Start your app:

```shell
python3 main.py
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!
