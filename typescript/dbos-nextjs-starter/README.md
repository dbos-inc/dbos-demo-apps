# DBOS + Next.js Starter

A Next.js app with a button that launches a durable DBOS workflow. The Next.js frontend enqueues workflows via `DBOSClient`; a separate worker process executes them.

## Setup

1. Install dependencies.

```shell
npm install
```

2. Set `DBOS_SYSTEM_DATABASE_URL` to your Postgres connection string and create the DBOS system schema:

```shell
export DBOS_SYSTEM_DATABASE_URL=postgresql://user:password@host:5432/dbname
npx dbos schema $DBOS_SYSTEM_DATABASE_URL
```

3. Start the app (launches both the Next.js server and the DBOS worker):

```shell
npm run dev:all
```

Visit [`http://localhost:3000`](http://localhost:3000) to see your app!
