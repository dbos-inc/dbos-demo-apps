# Welcome to DBOS!

This is a template app built with DBOS and FastAPI.
It demonstrates the durability of DBOS workflows.

### Run This App

To run this app, create a virtual environment and install dependencies:

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install dbos
```
Then start your app.
DBOS will automatically help you launch and connect to a new Postgres database (using Docker if available, else DBOS Cloud).
If you already use Postgres, you can instead set the `DBOS_DATABASE_URL` environment variable to a connection string to your database.

```shell
fastapi run app/main.py
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!

Then check out the [programming guide](https://docs.dbos.dev/python/programming-guide) to learn more about building with DBOS.
