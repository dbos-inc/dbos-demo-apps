## Earthquake Tracker

This app uses DBOS to stream earthquake data from the USGS into Postgres then displays it using [Streamlit](https://streamlit.io/).

Check out the source code for the data ingestion in `earthquake_tracker/main.py` and the Streamlit visualization in `earthquake_tracker/streamlit.py`.

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

Set the `DBOS_DATABASE_URL` environment variable to connect to this database:

```shell
export DBOS_DATABASE_URL="postgresql+psycopg://postgres:dbos@localhost:5432/earthquake_tracker"
```

If you already use Postgres, you can set the `DBOS_DATABASE_URL` environment variable to your own connection string.

3. Run database migrations:

```shell
dbos migrate
```

4. Start your app:

```shell
dbos start
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!