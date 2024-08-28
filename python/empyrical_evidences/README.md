<h1 align="center">Empyrical Evidences</h1>

<p align="center">
  Search hackernews for comment relevant to academic papers.
  Powered by Together.ai and DBOS.
</p>

## What does the app do

This application uses together.ai inference API to identity relevant topics in academic papers and rank the most relevant related comments from hackernews.
It uses DBOS Transact for workflow orchestration and is hosted on DBOS Cloud.

### endpoint: upload a paper

Implemented with a DBOS workflow, this endpoint accepts a paper title and URL. It:

1. Records metadata about the paper in postgres.
2. Download the paper.
3. Uses together.ai to query embeddings for the paper and store them in postgres (using pgvector).

If the program crashes, it will resume exactly where it left of. Each step is done exactly-once (transactions) or at-least-once (communicators). For example, if the application has a bug and crashes after a paper's record was inserted in the database, DBOS Transact, upon restart, will automatically resume this workflow where it left off.

### endpoint: search hackernews comments and rank them

This endpoint:

1. Uses `mistralai/Mixtral-8x7B-Instruct-v0.1` to search extract the 5 most relevant topics from a paper.
2. Searches hackernews using a DBOS Communicator for comments related to the topics.
3. Uses `Salesforce/Llama-Rank-V1` to select the most relevant comment for each topic.

---

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
