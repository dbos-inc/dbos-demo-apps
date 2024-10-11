<h1 align="center">Empyrical Evidences</h1>

<p align="center">
  Search Hacker News for comments relevant to your favorite academic papers.
  Powered by Together.ai and DBOS.
</p>

## What It Does

This application lets you interact with your favorite academic papers.
You can either ask a question to the paper, or search for comments on Hacker News related to the paper.
The application uses Together.ai inference APIs for both features and is serverlessly hosted on DBOS Cloud.

## How It Works

- First, you upload an academic paper. The app uses the Together.ai API to query the paper's embeddings and store them in Postgres using pgvector.
- Then, you can either ask a question to the paper or search Hacker News relevant comments.
- Searching for comments on Hacker News is a multi-agents workflow that first extracts the paper's key topics, searches Hacker News for relevant comments, and ranks the comments.

## Why Use DBOS

### Serverless

- Deploy to the cloud in a single command. Scale automatically. No DevOps required.
- [15x cheaper](https://www.dbos.dev/blog/dbos-vs-lambda-cost) and [25x faster](https://www.dbos.dev/blog/dbos-vs-aws-step-functions-benchmark) than AWS Lambda/Step Functions.

### Durable, transactional execution

- If your app is interrupted, workflows automatically resume from where they left off. Save money and time by not querying APIs again for already-executed steps.
- Workflows steps have exactly-once or at-least-once guarantees.

### Observability

- DBOS automatically generates and exports OpenTelemetry traces for your application
- In DBOS Cloud view your logs and traces from the [cloud console](https://console.dbos.dev/) or your [personal monitoring dashboard](https://docs.dbos.dev/cloud-tutorials/monitoring-dashboard).

## Setup Instructions

### Creating a Together.ai Account

Go to https://api.together.ai/ and sign-up.

### API Key

An API key will be provided for you when you register. You can always retrieve it in your [settings page](https://api.together.ai/settings/api-keys).

## Deploying To DBOS Cloud

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

The application exposes a simple frontend. Locally it default to `localhost:8000/`.
This section documents the API usage.

### Uploading A Paper

Call the `/uploadPaper` endpoint with query parameters `paper_url` (must be base64 encoded) and `paper_tile`. For example:

```bash
curl "localhost:8000/uploadPaper?paper_url=aHR0cHM6Ly9wZW9wbGUuY3NhaWwubWl0LmVkdS90ZGFuZm9yZC82ODMwcGFwZXJzL3N0b25lYnJha2VyLWNzdG9yZS5wZGYK&paper_name=cstore"
```

### Ask a question to the paper
Call the `/askPaper` endpoint and set `paper_name` and `question` in the payload. For example:

```bash
curl -X POST "localhost:8000/askPaper" -d '{"paper_name": "cstore", "question": "What is the main idea of the paper?"}' -H "Content-Type: application/json"
```

### Search Hacker News comments and rank them

Call the `startSearch` endpoint with query parameter `paper_id`. For example:

```bash
curl "localhost:8000/startSearch?paper_name=cstore"
```

The response, a list of comments for each topic, will be in JSON and the schema is:
```json
[{
    "topic",
    "comment",
    "url",
    "story_title",
}]
```
