# Welcome to DBOS!

This is a template app built with DBOS and Koa.

## Running Locally

First, install the application dependencies.

```shell
npm install
```

Next, we need to setup a Postgres database.
DBOS stores application execution history in Postgres.

If you have a Postgres database, you can set the `DBOS_SYSTEM_DATABASE_URL` environment variable to the connection string for that database.
You can set this environment variable directly or you can put it in an `.env` file in the root of this project.
The template app includes an `.env.example` file with a dummy connection string you can use as a reference.

If you don't have a Postgres server, you can start one locally using Docker.
The DBOS SDK includes a utility to start and stop a local Postgres Docker container.

```shell
npx dbos postgres start
npx dbos postgres stop
```

> Note, DBOS will automatically connect to Postgres running on localhost if `DBOS_SYSTEM_DATABASE_URL` is not specified.
> If you use a local Postgres Docker container, you do not need to set the `DBOS_SYSTEM_DATABASE_URL` environment variable.

Once you have a setup or configured a Postgres database for DBOS, you can launch the application.

```shell
npm run launch
```

Alternatively, you can run the application with [`nodemon`](https://nodemon.io/)
to enable automatic restart when the application changes.

```shell
npm run dev
```

Once the app is running, visit [`http://localhost:3000`](http://localhost:3000) to see your app.
Then, edit `src/main.ts` to start building!

## Deploying to DBOS Cloud

You can also deploy this app to DBOS Cloud via the Cloud CLI.
Install it globally with this command:

```shell
npm i -g @dbos-inc/dbos-cloud@latest
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```
</details>