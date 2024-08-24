# Llamabot: A Retrieval-Augmented GenAI Slackbot

This app is adapted from llamabot[https://github.com/run-llama/llamabot], reimplementing it with LlamaIndex + DBOS + FastAPI + Postgres.
It is a Slackbot that listens to your conversations in a channel, persists them in a database table, and uses that knowledge to answer questions about what's going on in your Slack channel.

### Creating an OpenAI Account
To run this app, you need an OpenAI developer account with some credits. Obtain an API key by [following this instruction](https://docs.llamaindex.ai/en/stable/getting_started/installation/#important-openai-environment-setup).

Set it as an environment variable:

```shell
export OPENAI_API_KEY=<your_openai_key>
```

### Setting Up Slack
You need a Slack workspace you can install apps to, and you need to be an admin.
Follow this tutorial to create an app for this bot (name it `Llamabot` or anything you like) and generate a token: https://api.slack.com/tutorials/tracks/getting-a-token Your token should start with "xoxb". Set it as an environment variable like so:

```shell
export SLACK_BOT_TOKEN=<your_token>
```

Then, you also need ot obtain a slack signing secret so the app can verify that each request comes from Slack.
You can find it under `Settings > Basic Information > Signing Secret` of your Slack app web UI. Set it as an environment variable like so:

```shell
export SLACK_SIGNING_SECRET=<your_secret>
```

After that, add your bot to a slack channel!

### Deploying to the Cloud

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```