# AI Storyteller

This app generates a story based on the text of Paul Graham's essay, "What I Worked On". 

This is inspired by LlamaIndex's [famous 5-line starter](https://docs.llamaindex.ai/en/stable/getting_started/starter_example/).

## Set OpenAI API Key

To run this app, you need an OpenAI developer account. Obtain an API key [here](https://platform.openai.com/api-keys) and set up a payment method for your account [here](https://platform.openai.com/account/billing/overview).
LlamaIndex uses the `gpt-3.5-turbo` model for text generation and `text-embedding-ada-002` for retrieval and embeddings.
Make sure you have some credits (~$5) to use the models.


Set the API as an environment variable:

```shell
export OPENAI_API_KEY=<your_openai_key>
```

If you use Windows, run
```shell
set OPENAI_API_KEY=<your_openai_key>
```

## Deploying to the Cloud

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

## Running Locally

To run this app locally, you need a Postgres database.
If you have Docker, you can start one with:

```shell
export PGPASSWORD=dbos
python3 start_postgres_docker.py
```

Then run:

```shell
pip install -r requirements.txt
dbos migrate
dbos start
```

Visit http://localhost:8000 to see some stories!