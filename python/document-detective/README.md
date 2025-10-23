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

## Setup

1. Install dependencies and activate your virtual environment:

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Start Postgres in a local Docker container:

```bash
dbos postgres start
```

Set the `DBOS_DATABASE_URL` environment variable to connect to this database:

```shell
export DBOS_DATABASE_URL="postgresql+psycopg://postgres:dbos@localhost:5432/document_detective"
```

If you already use Postgres, you can set the `DBOS_DATABASE_URL` environment variable to your own connection string.
3. Run database migrations:

```shell
dbos migrate
```

4. Start your app!

```shell
python3 -m document_detective.main
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your chat agent!


### Indexing Documents

To index a batch of PDF documents, send a list of their URLs in a POST request to the `/index` endpoint.

For example, try this cURL command to index Apple's SEC 10-K filings for 2021, 2022, and 2023:

```shell
curl -X POST "http://localhost:8000/index" \
     -H "Content-Type: application/json" \
     -d '{"urls": ["https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/faab4555-c69b-438a-aaf7-e09305f87ca3.pdf", "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/b4266e40-1de6-4a34-9dfb-8632b8bd57e0.pdf", "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/42ede86f-6518-450f-bc88-60211bf39c6d.pdf"]}'
```