# LLM-Powered Chatbot

This is a chatbot built with DBOS and LangChain.

In addition to chatting, this bot displays both the amount of CPU time and wall-clock time consumed by your requests.
As you chat, you'll quickly notice that while your requests may take a long time, they consume very little CPU.
That's because they spend most of their time idle waiting for the LLM to respond.
This gap explains why DBOS is [50x more cost-efficient](https://www.dbos.dev/blog/aws-lambda-hidden-wait-costs) than other serverless platforms for AI workloads&mdash;because DBOS bills only for the CPU time you actually consume, while other platforms bill for the total request duration.

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

This command outputs a URL&mdash;visit it to see your chatbot!
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

Visit [`http://localhost:8000`](http://localhost:8000) to see your chatbot!
