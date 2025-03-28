# DBOS Toolbox

This app contains example code for many DBOS features, including workflows, steps, queues, scheduled workflows, and transactions.
You can use it as a template when starting a new DBOS app&mdash;start by editing `main.py`.

To learn more about how to program with DBOS, check out the [DBOS programming guide](https://docs.dbos.dev/python/programming-guide).

### Running Locally

To start this app locally, run:

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install dbos
dbos migrate
dbos start
```

Visit http://localhost:8000/ to see the app!
