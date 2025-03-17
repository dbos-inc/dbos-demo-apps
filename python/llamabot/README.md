# Llamabot: A Retrieval-Augmented GenAI Slackbot

Llamabot is a Slackbot that listens to your conversations in a channel, persists them in a Postgres vector index, and uses that knowledge to answer questions about what's going on in your Slack channel.
This app is adapted from https://github.com/run-llama/llamabot, reimplementing it with LlamaIndex + DBOS + FastAPI + Postgres.

This app uses DBOS to:

1. Serverlessly deploy the bot to the cloud.
2. Durably orchestrate the RAG pipeline, guaranteeing each Slack message is processed exactly once and no message is lost or duplicated.

## Creating an OpenAI Account
To run this app, you need an OpenAI developer account. Obtain an API key [here](https://platform.openai.com/api-keys) and set up a payment method for your account [here](https://platform.openai.com/account/billing/overview).
LlamaIndex uses the `gpt-3.5-turbo` model for text generation and `text-embedding-ada-002` for retrieval and embeddings.
Make sure you have some credits (~$5) to use the models.


Set the API as an environment variable:

```shell
export OPENAI_API_KEY=<your_openai_key>
```

## Setting Up Slack
You need a Slack workspace you can install apps to (you need to be an admin).

### Creating an App

Go to [Your Apps](https://api.slack.com/apps) and click "Create New App". Choose "From a manifest", pick a workspace for your app, and copy paste the following manifest to the window. This gives you an app with proper permissions.

```json
{
    "display_information": {
        "name": "LlamaBot",
        "description": "A RAG GenAI Slackbot in LlamaIndex + DBOS",
        "background_color": "#004492"
    },
    "features": {
        "bot_user": {
            "display_name": "LlamaBot",
            "always_online": true
        }
    },
    "oauth_config": {
        "scopes": {
            "bot": [
                "channels:history",
                "channels:join",
                "channels:read",
                "chat:write",
                "users:read"
            ]
        }
    },
    "settings": {
        "event_subscriptions": {
            "request_url": "https://localhost",
            "bot_events": [
                "message.channels"
            ]
        },
        "org_deploy_enabled": false,
        "socket_mode_enabled": false,
        "token_rotation_enabled": false
    }
}
```

> [!NOTE]
> The "request_url" under "event_subscriptions" is a placeholder.
> You will replace it with a valid URL after you [deploy to DBOS Cloud](#deploying-to-the-cloud).

Once the app is created, you can get a slack signing secret so the app can verify that each request comes from Slack.
You can find it under `Settings > Basic Information > Signing Secret` of your Slack app web UI. Set it as an environment variable like so:

```shell
export SLACK_SIGNING_SECRET=<your_secret>
```

### Installing to Workspace

Click `Settings > Install App` on the side bar to add your app to your workspace.
After that, you should get a Bot User OAuth Token.
Your token should start with "xoxb". Set it as an environment variable like so:

```shell
export SLACK_BOT_TOKEN=<your_token>
```

After that, add your bot to a slack channel! You can do so by clicking the channel name in the [channel header](https://slack.com/help/articles/360059928654-How-to-use-Slack--your-quick-start-guide#channels), then selecting the "Integrations" tab.
Search the bot's name and add it to a channel you like.

This app currently stores all messages from all channels in the same table. So you might only want to add it to a single channel.

## Deploying to the Cloud

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

This command outputs a URL -- this is webhook endpoint for your Slack app!
Go to `Event Subscriptions > Enable Events` and set `Request URL` to your app's URL.
If your app is deployed correctly, it should show as `Verified`.

You can also visit the [DBOS Cloud Console](https://console.dbos.dev/) to see your app's status and logs.

Now you can use your app from Slack!
Llamabot answers questions whenever you at the bot (`@Llamabot`) in your message or reply to a bot's message, and it stores any other messages as a "fact" in its vector store.

An example conversation with the bot:

<img src="https://github.com/user-attachments/assets/1051ed46-ac6f-49bf-9109-449df9e4bca2" data-canonical-src="https://github.com/user-attachments/assets/1051ed46-ac6f-49bf-9109-449df9e4bca2" width="300"/>

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
export DBOS_DATABASE_URL=postgresql://postgres:${PGPASSWORD}@localhost:5432
dbos migrate
dbos start
```

Then, on another terminal window, we'll use [ngrok](https://ngrok.com/) to setup an endpoint for your local webhook.

```shell
ngrok http 8000
```

Use this URL in your Slack app for local development and testing.
