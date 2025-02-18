# Welcome to DBOS!

This is a template app built with DBOS and FastAPI.

### Getting Started

To get started building, edit `app/main.py`.

To include new packages or dependencies, add them to `requirements.txt`.

<details>
<summary><strong>Deploying via the DBOS Cloud CLI</strong></summary>

You can deploy this app to DBOS Cloud via the DBOS Cloud CLI.
Install it with this command (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```
</details>

### Developing Locally

To run this app locally, create a virtual environment and install dependencies:

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
Then start your app. DBOS will automatically guide you through connecting to your app to a Postgres database.

```shell
dbos start
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!
