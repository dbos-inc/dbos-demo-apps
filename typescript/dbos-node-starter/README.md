# Welcome to DBOS!

This example app demonstrates the durability of DBOS workflows.

## Setup

1. Install dependencies and build the application

```shell
npm install
npm run build
```

2. Start Postgres in a local Docker container:

```bash
npx dbos postgres start
```

Set the `DBOS_SYSTEM_DATABASE_URL` environment variable to connect to this database:

```shell
export DBOS_SYSTEM_DATABASE_URL="postgresql+psycopg://postgres:dbos@localhost/dbos_node_starter"
```

If you already use Postgres, you can instead set the `DBOS_SYSTEM_DATABASE_URL` environment variable to your own connection string.

3. Start your app:

```shell
npm run start
```

Visit [`http://localhost:3000`](http://localhost:3000) to see your app!

Then check out the [programming guide](https://docs.dbos.dev/typescript/programming-guide) to learn more about building with DBOS.
