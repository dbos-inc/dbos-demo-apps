# DBOS Django Starter

This app shows how to use DBOS with Django.

To learn more about, check out the [DBOS + Django Integration Guide](https://docs.dbos.dev/integrations/django).

## Setup

1. Install dependencies

```shell
uv sync
```

2. Start Postgres in a local Docker container, create a database for Django, and run Django migrations:

```
uv run dbos postgres start
psql -c "CREATE DATABASE djangodbos"
uv run python3 manage.py migrate
```

Set the `DBOS_SYSTEM_DATABASE_URL` environment variable to connect to this database:

```shell
export DBOS_SYSTEM_DATABASE_URL="postgresql+psycopg://postgres:dbos@localhost:5432/djangodbos"
```

3. Start your app:

```shell
uv run python manage.py runserver --noreload
```

Visit [`http://localhost:8000/polls/callWorkflow/a/b`](http://localhost:8000/polls/callWorkflow/a/b) to start a workflow!