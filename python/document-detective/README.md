# Document Detective

In this app, we use DBOS and LlamaIndex to build and serverlessly deploy a chatbot agent that can index PDF documents and answer questions about them.

## Creating an OpenAI Account

To run this app, you need an OpenAI developer account.
Obtain an API key [here](https://platform.openai.com/api-keys) and set up a payment method for your account [here](https://platform.openai.com/account/billing/overview).
This bot uses `gpt-3.5-turbo` for text generation.
Make sure you have some credits (~$1) to use it.

Set your API key as an environment variable:

```shell
export OPENAI_API_KEY=<your_openai_key>
```
### Deploying to the Cloud

To serverlessly deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

This command outputs a URL&mdash;visit it to see your chat agent!
You can also visit the [DBOS Cloud Console](https://console.dbos.dev/login-redirect) to see your app's status and logs.

### Running Locally

First create a virtual environment:

```shell
python3 -m venv .venv
source .venv/bin/activate
```

DBOS requires a Postgres database.
If you don't already have one, you can start one with Docker:

```shell
export PGPASSWORD=dbos
python3 start_postgres_docker.py
```

Then run the app in the virtual environment:

```shell
pip install -r requirements.txt
dbos migrate
dbos start
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your chat agent!


### Indexing Documents

To index a batch of PDF documents, send a list of their URLs in a POST request to the `/index` endpoint.

For example, try this cURL command to index Apple's 10-K filings for 2021, 2022, and 2023:

```shell
curl -X POST "http://localhost:8000/index" \
     -H "Content-Type: application/json" \
     -d '{"urls": ["https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/faab4555-c69b-438a-aaf7-e09305f87ca3.pdf", "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/b4266e40-1de6-4a34-9dfb-8632b8bd57e0.pdf", "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/42ede86f-6518-450f-bc88-60211bf39c6d.pdf"]}'

```

URL will be `http://localhost:8000` locally and your app URL in DBOS Cloud.