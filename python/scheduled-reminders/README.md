## Scheduled Reminders

This app uses DBOS to schedule reminder emails to send weeks or months in the future.

### Setting Up SendGrid

This app uses [SendGrid](https://sendgrid.com/en-us) to send reminder emails.
Create a SendGrid account, verify an email for sending, and generate an API key.
Then set the API key and sender email as environment variables:

```shell
export SENDGRID_API_KEY=<your key>
export SENDGRID_FROM_EMAIL=<your email>
```

### Deploying to the Cloud

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

This command outputs a URL&mdash;visit it to schedule a reminder!
You can also visit the [DBOS Cloud Console](https://console.dbos.dev/) to see your app's status and logs.

### Running Locally

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

Visit [`http://localhost:8000`](http://localhost:8000) to schedule a reminder!