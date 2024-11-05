# Welcome to DBOS!

This is a template app built with DBOS and FastAPI.

### Getting Started

To get started building, edit this app's code in `app/main.py`.
Then, commit your changes and visit the [cloud console](https://console.dbos.dev/applications) to redeploy it from GitHub!

You can also deploy this app via the DBOS Cloud CLI.
Install it with this command (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

### Developing Locally

To run this app locally, you need to connect it to a Postgres database.
You can use a DBOS Cloud database, a Docker container, or a local Postgres installation.

To use a DBOS Cloud database, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then set a password for your DBOS Cloud database:

```shell
dbos-cloud db reset-password
```

Then connect your local app to your cloud database. When prompted, enter the password you just set.

```shell
dbos-cloud db local
```

Alternatively, if you have Docker, you can start a Postgres locally with:

```shell
export PGPASSWORD=dbos
python3 start_postgres_docker.py
```

After connecting to Postgres, start your app with:

```shell
dbos start
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!

### Deploying to DBOS Cloud

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

This command outputs a URL: visit it to see your app!
You can also visit the [DBOS Cloud Console](https://console.dbos.dev/) to see your app's status and logs.