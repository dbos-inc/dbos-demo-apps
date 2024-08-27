<h1 align="center">Empyrical Evidences</h1>

<p align="center">
  Learn queueing theory from top tiers system papers.
  Powered by Together.ai and DBOS.
</p>

## Tech Stack

- Application stack with DBOS
- Inference API with Together.ai
- Postgres + pgvector for vector database

## Setting up Together.ai

### Creating a together.ai account

Go to https://api.together.ai/ and sign-up

### API key

An API key will be provided for you when you register. You can always retrieve it in your [settings page](https://api.together.ai/settings/api-keys)

## Deploying to DBOS Cloud

### Creating a DBOS Cloud account

Sign-up for [DBOS Cloud](https://console.dbos.dev/).

### Setup DBOS Cloud CLI

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

This command outputs a URL -- this is where your application is hosted on DBOS Cloud.
You can visit the [DBOS Cloud Console](https://console.dbos.dev/) to see your app's status and logs.

## Running Locally

To run this app locally, you need a Postgres database.
If you have Docker, you can start one with:

```shell
export PGPASSWORD=dbos
python3 start_postgres_docker.py
```

Then run:

```shell
python3 -m venv dbos-empyrical-venv
source dbos-empyrical-venv/bin/activate
pip install -r requirements.txt
dbos migrate
dbos start
```
