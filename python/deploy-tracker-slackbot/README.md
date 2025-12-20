# Deploy Tracker Slackbot

This Slackbot shows how to build reliable webhooks with DBOS.
It helps you deploy your app and track the deploy pipeline progress. It listens to commands such as `/deploy` and `/check_status` in your Slack channel, and sends back status report.

This app demonstrates how to use DBOS to guarantee that:
- Each deploy workflow can run asynchronously in the background.
- Using a queue to control concurrency. We set queue concurrency limit to 1 so only one deploy will run at the same time.
- Real-time status updates via DBOS events
- Make sure the deploy workflow can resume from where it left off even if the Slackbot itself crashes or restarts.

## Set Up Slack
You need a Slack workspace you can install apps to (you need to be an admin).

### Create an App

Go to [Your Apps](https://api.slack.com/apps) and click "Create New App".
Make sure you grant `chat:write` to this bot so it can send messages to the channel.

Once the app is created, you can get a slack signing secret so the app can verify that each request comes from Slack.
You can find it under `Settings > Basic Information > Signing Secret` of your Slack app web UI. Set it as an environment variable like so:

```shell
export SLACK_SIGNING_SECRET=<your_secret>
```

### Install to Workspace

Click `Settings > Install App` on the side bar to add your app to your workspace.
After that, you should get a Bot User OAuth Token.
Your token should start with "xoxb". Set it as an environment variable like so:

```shell
export SLACK_BOT_TOKEN=<your_token>
```

After that, add your bot to a slack channel! You can do so by clicking the channel name in the [channel header](https://slack.com/help/articles/360059928654-How-to-use-Slack--your-quick-start-guide#channels), then selecting the "Integrations" tab.
Search the bot's name and add it to a channel you like.

### Create Slash Commands

Click `Features > Slash Commands` and define two commands for this app:
- `/deploy`: the command to start a deploy workflow asynchronously in the background
- `/check_status [workflow_id]`: the command to check the status of a deploy workflow

For the request URL field, you'll need to specify your hosted URL that can be accessed publicly by Slack. It'll look like:
```
https://<PUBLIC URL>/slack/events
```

## Run the App

1. Install dependencies

```
uv sync
```

2. (Optional) Connect to Postgres. DBOS can connect to either SQLite or Postgres.
SQLite is the default for development, but you can connect to Postgres by setting your `DBOS_SYSTEM_DATABASE_URL` environment variable to a connection string to your Postgres database.

```
export DBOS_SYSTEM_DATABASE_URL=...
```

3. (Optional) Connect to [DBOS Conductor](https://docs.dbos.dev/production/self-hosting/conductor).

```
export DBOS_CONDUCTOR_KEY=...
```

4. Start your app:
```shell
uv run python main.py
```

It listens incoming events from Slack on port 3000.
Then, on another terminal window, we'll use [ngrok](https://ngrok.com/) to setup a public endpoint for your local webhook.

```shell
ngrok http 3000
```

Use this public URL in your Slack app ([request URL](#creating-slash-commands)).

Now you can play with your app! For example, you can start a deploy workflow:

```
/deploy
```

It'll return a workflow ID, and the bot will push real-time updates to the Slack channel as the deploy workflow progress.

If you have multiple pending deploys, then only one will execute at a time.

![Deploy command](./img/deploy-cmd.png)

You can also check the status of a workflow and its current progress:

```
/check_status <workflow-id>
```

It'll show the DBOS workflow status as well as the custom status updates from the workflow

![Check status command](./img/check-status-cmd.png)