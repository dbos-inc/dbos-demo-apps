# DBOS guide: sending greeting emails.

This is a tutorial app describe in the [DBOS docs](https://docs.dbos.dev/category/quickstart-programming).

It was created by replacing the `src/operations.ts` file bootstrapped with `npx @dbos-inc/dbos-sdk init`.

## Setup

Start the database.

```bash
export PGPASSWORD=dbos
./start_postgres_docker.sh
```

Run our provided migration to create a database table:

```bash
npx knex migrate:latest
```

Next, build and run the app:

```bash
npm install
npm run build
npx dbos-sdk start
```

Finally, curl the server to see that it's working!

```bash
curl http://localhost:3000/greeting/Mike
```

## Learn More

To learn more about DBOS, take a look at [our documentation](https://docs.dbos.dev/) or our [source code](https://github.com/dbos-inc/dbos-sdk).
