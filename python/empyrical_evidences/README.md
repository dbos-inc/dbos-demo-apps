<h1 align="center">Empyrical Evidences</h1>

<p align="center">
  Search Hacker News for comments relevant to your favorite academic papers.
  Powered by Together.ai and DBOS.
</p>

## What It Does

This application uses Together.ai inference APIs to identify relevant topics in academic papers, search Hacker News for related comments and rank them.
The app is hosted on DBOS Cloud.

## How It Works

- Upload a paper. The app uses Together.ai API to query the paper's embeddings and store them in postgres/pgvector.
- Search Hacker News. The app uses a multi-agent workflow and Together.AI inference API. First, it extracts the paper's key topics. Second, it searchs Hacker News for relevant comments. Third, it ranks the comments using Together.ai API.

## Why Use DBOS

- Fast Serverless deploy to the cloud.
- Durable execution: if the application crashes, workflows will be resumed where they left off and Together.ai APIs will not be queried again for already-executed steps.
- Automatically capture provenance/lineage data for your workflows.

## Setup Instructions

### Creating A Together.ai Account

Go to https://api.together.ai/ and sign-up.

### API Key

An API key will be provided for you when you register. You can always retrieve it in your [settings page](https://api.together.ai/settings/api-keys).

## Deploying To DBOS Cloud

### Creating A DBOS Cloud Account

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
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
dbos migrate
dbos start
```

## Usage

### Uploading A Paper

Call the `/uploadPaper` endpoint with query parameters `paper_url` (must be base64 encoded) and `paper_tile`. For example:

```bash
curl "localhost:8000/uploadPaper?paper_url=aHR0cHM6Ly9wZW9wbGUuY3NhaWwubWl0LmVkdS90ZGFuZm9yZC82ODMwcGFwZXJzL3N0b25lYnJha2VyLWNzdG9yZS5wZGYK&paper_title=cstore"
```

This will return a unique identifier for the paper. You will use that ID for your search.

### Search Hacker News comments and rank them

Call the `startSearch` endpoint with query parameter `paper_id`. For example:

```bash
curl "localhost:8000/searchPaper?paper_id=c75178c7-7168-497b-a41f-381d8a557270
```

The response will be in JSON.
