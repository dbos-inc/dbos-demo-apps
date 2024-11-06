# Welcome to DBOS!

This is a template app built with DBOS and FastAPI.

### Getting Started

To get started building, edit `app/main.py`.
Then, commit your changes and visit the [cloud console](https://console.dbos.dev/applications) to redeploy it from GitHub!

<details>
<summary><strong>Deploying via the DBOS Cloud CLI</strong></summary>

You can also deploy this app via the DBOS Cloud CLI.
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

To run this app locally, you need to connect it to a Postgres database.
You can use a DBOS Cloud database, a Docker container, or a local Postgres installation.

<details>
<summary><strong>Connecting to a DBOS Cloud Postgres database</strong></summary>

First install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then set a password for your DBOS Cloud database:

```shell
dbos-cloud db reset-password
```

Then connect your local app to your cloud database. When prompted, enter the password you just set.

```shell
dbos-cloud db local
```
</details>

<details>
<summary><strong>Starting Postgres with Docker</strong></summary>

If you have Docker, you can start a Postgres database locally with:

```shell
export PGPASSWORD=dbos
python3 start_postgres_docker.py
```
</details>


After connecting to Postgres, create a virtual environment and install dependencies:

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Then start your app:

```shell
dbos start
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!
