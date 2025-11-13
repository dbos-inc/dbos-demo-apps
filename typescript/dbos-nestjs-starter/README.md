# DBOS + Nest.js

This app shows how to use DBOS with Nest.js.

To learn more, check out the [integration guide](https://docs.dbos.dev/integrations/nestjs).

## Setup

1. Install dependencies

```shell
npm install
```

2. Start Postgres in a local Docker container:

```
npx dbos postgres start
```

Set the `DBOS_SYSTEM_DATABASE_URL` environment variable to connect to this database:

```shell
export DBOS_SYSTEM_DATABASE_URL="postgresql://postgres:dbos@localhost:5432/dbos_nestjs_starter"
```

3. Start your app:

```shell
npm run start
```

Visit http://localhost:3000 to start a workflow!

Or run tests:

```shell
npm run test
```