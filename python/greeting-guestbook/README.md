# Greeting Guestbook

This is the app described in the [DBOS Programming Guide](https://docs.dbos.dev/python/programming-guide).

### Running Locally

To run this app locally, you need a Postgres database.
If you have Docker, you can start one with:

```shell
export PGPASSWORD=dbos
python3 start_postgres_docker.py
```

Then run:

```shell
pip install -r requirements.txt
dbos migrate
dbos start
```

Visit [`http://localhost:8000/greeting/dbos`](http://localhost:8000/greeting/dbos) to try out the app!