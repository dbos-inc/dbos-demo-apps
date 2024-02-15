# TPC-C Benchmark Using DBOS SDK

This is a TPC-C TypeScript + Knex.js implementation written with [DBOS SDK](https://docs.dbos.dev/).

## Running Locally

First, start the database.
DBOS workflow works with any Postgres database, but to make things easier, we've provided a nifty script that starts Postgres locally in a Docker container and creates a database:

```bash
export PGPASSWORD=dbos
./start_postgres_docker.sh
```

Then, create some database tables.
In this quickstart, we use [knex.js](https://knexjs.org/) to manage database migrations.
Run our provided migration to create a database table:

```bash
npx knex migrate:latest
```

To load TPC-C data, we use [go-tpc](https://github.com/pingcap/go-tpc/tree/master).
You can install it using the following script:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/pingcap/go-tpc/master/install.sh | sh
```

Then load the TPC-C data with the number of warehouses (scale factor) you want, for example, populating data of one warehouse in the local Postgres database you just created:
```bash
go-tpc tpcc prepare --no-check -d postgres -U postgres -p dbos -D tpcc -P 5432 --conn-params sslmode=disable --warehouses 1
```

Next, build and run the app:

```bash
npm run build
npx dbos-sdk start
```

Finally, curl the server to see that it's working! You can modify the last parameter (we use `1` here for one warehouse) to the number of warehouses you loaded:

```bash
# Trigger the Payment transaction
curl http://localhost:3000/payment/1

# Trigger the NewOrder transaction
curl http://localhost:3000/neworder/1
```

> [!NOTE]
> We deliberately make 1% of the NewOrder transaction fails, so it's normal to see `Error new order: I_ID=-12345 not found!` occasionally.

## Deploying to DBOS Cloud
Coming soon...