# Greeting Guestbook

This is the app described in the [DBOS Programming Guide](https://docs.dbos.dev/getting-started/quickstart-programming-python).

### Running Locally

To run this app locally, you need a Postgres database.
If you have Docker, you can start one with:

```shell
export PGPASSWORD=dbos
python3 start_postgres_docker.py
```

Visit https://demo-guestbook.cloud.dbos.dev/key to get an "API key" for this app and set it as an environment variable:

```shell
export GUESTBOOK_KEY=<your-key>
```

Then run:

```shell
pip install -r requirements.txt
dbos migrate
dbos start
```

Visit [`http://localhost:8000`](http://localhost:8000) to see the app!