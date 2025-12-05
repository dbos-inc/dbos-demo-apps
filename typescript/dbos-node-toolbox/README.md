# DBOS Toolbox

This app contains example code for many DBOS features, including workflows, steps, queues, scheduled workflows, and transactions.
You can use it as a template when starting a new DBOS app&mdash;start by editing `src/main.ts`.

To learn more about how to program with DBOS, check out the [DBOS programming guide](https://docs.dbos.dev/typescript/programming-guide).

## Running Locally

First, install the application dependencies.

```shell
npm install
```

Next, we need to setup a Postgres database.
DBOS stores application execution history in Postgres.
Additionally, the toolbox app uses a Knex.js based DBOS Data Source, which stores data in a separate database.
While these databases can be deployed to separate Postgres servers, we will deploy to a single server for simplicity.

If you have a Postgres database, you can set the `DBOS_DATABASE_URL` environment variable to the connection string for that database.
You can set this environment variable directly or you can put it in an `.env` file in the root of this project.
The template app includes an `.env.example` file with a dummy connection string you can use as a reference.

> Note, this demo uses `DBOS_DATABASE_URL` so that it can also be deployed to DBOS Cloud.
> If you are running DBOS locally, you can use whatever mechanism you wish to manage database connection information.

If you don't have a Postgres server, you can start one locally using Docker.
The DBOS SDK includes a utility to start and stop a local Postgres Docker container.

```shell
npx dbos postgres start
npx dbos postgres stop
```

> Note, this demo app is configured to automatically connect to Postgres running on localhost if `DBOS_DATABASE_URL` is not specified.
> If you use a local Postgres Docker container, you do not need to set the `DBOS_DATABASE_URL` environment variable.

Once you have a setup or configured a Postgres database for DBOS, you need to configure the application database.
This demo app includes script file to create the database and run the Knex.js migrations required by the application.
You can run this script via the `db:setup` npm script.

```shell
npm run db:setup
```

Once you have configured the application database, you can launch the application.
The launch script has a pre-step to build the app automatically.

```shell
npm run launch
```

Alternatively, you can run the application with [`nodemon`](https://nodemon.io/)
to enable automatic restart when the application changes.

```shell
npm run dev
```

Once the app is running, visit [`http://localhost:3000`](http://localhost:3000) to see the app in action.
You can edit the code in `src/main.ts` to start building.
