# Welcome to DBOS!

This is a template app built with DBOS and Express.

### Getting Started

To get started building, edit `src/main.ts`.
Then, commit your changes and visit the [cloud console](https://console.dbos.dev/applications) to redeploy it from GitHub!


<details>
<summary><strong>Deploying via the DBOS Cloud CLI</strong></summary>

You can also deploy this app via the DBOS Cloud CLI.
Install it globally with this command:

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```
</details>

### Developing Locally

To run this app locally, you need to connect it to a Postgres database.
You can use a DBOS Cloud database, a Docker container, or a local Postgres installation.

<details>
<summary><strong>Connecting to a DBOS Cloud Postgres database</strong></summary>

> [!NOTE]  
> You must have already deployed an app to DBOS Cloud before using the DBOS Cloud Postgres database.

First install the DBOS Cloud CLI globally:

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
</details>

<details>
<summary><strong>Starting Postgres with Docker</strong></summary>

If you have Docker, you can start a Postgres database locally with:

```shell
export PGPASSWORD=dbos
node start_postgres_docker.js
```
</details>


After connecting to Postgres, install dependencies and start your app:

```shell
npm install
npm run build
npx dbos migrate
npm run start
```

or simply run in the dev mode:

```shell
npm install
npm run dev
```

Visit [`http://localhost:3000`](http://localhost:3000) to see your app!