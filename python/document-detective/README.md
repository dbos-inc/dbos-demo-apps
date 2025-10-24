# Document Detective

In this example, we'll use DBOS to build a reliable and scalable data processing pipeline. We'll show how DBOS can help you horizontally scale an application to process many items concurrently and seamlessly recover from failures. Specifically, we'll build a pipeline that indexes PDF documents for RAG, though you can use a similar design pattern to build almost any data pipeline.

## Creating an OpenAI Account

To run this app, you need an OpenAI developer account.
Obtain an API key [here](https://platform.openai.com/api-keys) and set up a payment method for your account [here](https://platform.openai.com/account/billing/overview).
Make sure you have some credits (~$1) to use it.

Set your API key as an environment variable:

```shell
export OPENAI_API_KEY=<your_openai_key>
```

## Setup

1. Install dependencies:

```shell
uv sync
```

2. Start Postgres in a local Docker container:

```bash
uv run dbos postgres start
```

Set the `DBOS_SYSTEM_DATABASE_URL` environment variable to connect to this database:

```shell
export DBOS_SYSTEM_DATABASE_URL="postgresql+psycopg://postgres:dbos@localhost:5432/document_detective"
```

If you already use Postgres, you can set the `DBOS_SYSTEM_DATABASE_URL` environment variable to your own connection string.

3. Set up the Postgres vector store for LlamaIndex (requires pgvector):

```shell
uv run python3 setup_llamaindex.py
```

4. Start your app!

```shell
uv run python3 -m document_detective.main
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your chat agent!


### Indexing Documents

To index a batch of PDF documents, send a list of their URLs in a POST request to the `/index` endpoint.

For example, try this cURL command to index Apple's SEC 10-K filings for 2020-2024:

```shell
curl -X POST "http://localhost:8000/index" \
     -H "Content-Type: application/json" \
     -d '{"urls": [
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2020.pdf",
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2021.pdf",
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2022.pdf",
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2023.pdf",
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2024.pdf"
]}'
```