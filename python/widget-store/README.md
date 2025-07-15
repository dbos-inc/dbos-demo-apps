# Widget Store

This app uses DBOS to deploy an online storefront that's resilient to any failure.
You can interrupt it at any time while placing an order (we even provide a "crash button" to facilitate experimentation) and it will resume from exactly where it left off.

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
alembic upgrade head
```

4. Start your app:

```shell
python3 -m widget_store.main
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!