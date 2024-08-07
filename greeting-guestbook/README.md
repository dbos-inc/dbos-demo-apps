# DBOS Guestbook Hello App

This is the app described in the [DBOS Programming Guide](https://docs.dbos.dev/getting-started/quickstart-programming)

## Getting Started

First, install all the app dependencies
```bash
npm install
```

Start the database. You can use any Postgres DB. If you don't have one, we've provided a script that starts Postgres locally in a Docker container and creates a database:

```bash
export PGPASSWORD=dbos  #set PGPASSWORD=dbos on Windows
node start_postgres_docker.js
```

Then, create some database tables.

```bash
npx dbos migrate
```

Then, visit the guestbook key generator at [https://demo-guestbook.cloud.dbos.dev/key](https://demo-guestbook.cloud.dbos.dev/key) and save your key to `dbos-config.yaml`

Next, build and run the app:

```bash
npm run build
npx dbos start
```

Finally, curl the server to see that it's working!

```bash
 curl http://localhost:3000/greeting/dbos
```

## Learn More

To learn more about DBOS, take a look at [our documentation](https://docs.dbos.dev/) or our [source code](https://github.com/dbos-inc/dbos-transact).
