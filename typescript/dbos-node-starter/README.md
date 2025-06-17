# Welcome to DBOS!

This is a template app built with DBOS and Express.

### Developing Locally

First, set the `DBOS_DATABASE_URL` environment variable to a connection string to your Postgres database.

Then, install dependencies, build your app, and set up its database tables:

```shell
npm install
npm run build
```

Then, start it:

```shell
npm run start
```

Alternatively, run it in dev mode using `nodemon`:

```shell
npm install
npm run dev
```

Visit [`http://localhost:3000`](http://localhost:3000) to see your app.
Then, edit `src/main.ts` to start building!

<details>
<summary><strong>Deploying via the DBOS Cloud CLI</strong></summary>

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