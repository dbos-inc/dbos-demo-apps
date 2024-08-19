## Hacker News Slackbot

This app (inspired by [Modal](https://modal.com/docs/examples/hackernews_alerts)) uses DBOS to deploy a cron job that periodically searches Hacker News for new posts about serverless computing and posts them to a Slack channel.

To run the app, you need a Slack bot token.
Follow this tutorial to generate one: https://api.slack.com/tutorials/tracks/getting-a-token
Your token should start with "xoxb".
Set it as an environment variable like so:

```
export SLACK_HN_BOT_OAUTH_TOKEN=<your_token>
```

You should also create a Slack channel named `hacker-news-alerts` for the bot to post to!

To try the app locally, run:

```
pip install -r requirements.txt
dbos start
```

Of course, you don't want to host a cron job locally!
Keeping it running would be a lot of work :)

Instead, to deploy this app as a persistent cron job to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```
dbos-cloud app deploy
```

You can visit the [DBOS Cloud Console](https://console.dbos.dev/) to see your app's status and logs.