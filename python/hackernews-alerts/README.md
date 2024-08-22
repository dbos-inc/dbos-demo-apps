## Hacker News Slackbot

This app (inspired by [Modal](https://modal.com/docs/examples/hackernews_alerts)) uses DBOS to deploy a cron job that periodically searches Hacker News for people commenting about serverless computing and posts the comments to Slack.

To run the app, you need a Slack bot token.
Follow this tutorial to generate one: https://api.slack.com/tutorials/tracks/getting-a-token
Your token should start with "xoxb".
Set it as an environment variable like so:

```shell
export SLACK_HN_BOT_OAUTH_TOKEN=<your_token>
```

You should also create a Slack channel named `hacker-news-alerts` for the bot to post to!

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

This command will output your app's URL--visit it to see some earthquakes!
You can also visit the [DBOS Cloud Console](https://console.dbos.dev/) to see your app's status and logs.

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