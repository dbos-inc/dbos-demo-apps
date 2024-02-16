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
./install_go_tpc.sh
```

After installation, the script would prompt the installation path and instruction to run it. For example, you may need to open a new terminal, or source your shell profile to use it.
An example output from the script:
```
Detected shell: bash
Shell profile:  /home/ubuntu/.bashrc
/home/ubuntu/.bashrc has been modified to to add go-tpc to PATH
open a new terminal or source /home/ubuntu/.bashrc to use it
Installed path: /home/ubuntu/.go-tpc/bin/go-tpc
```

Then load the TPC-C data:
```bash
npm run load
```
We load a single warehouse of data, but you can modify the `load` script in `package.json` for larger-scale data.

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

You can also run unit tests:
```bash
npm test
```

## Deploying to DBOS Cloud
Coming soon...