# DBOS Queue Worker

This example demonstrates how to build DBOS workflows in their own "queue worker" service and enqueue and manage them from other services.

## Setup

1. Install dependencies:

```shell
npm install
```

2. Start Postgres in a Docker container (if you already use Postgres, instead set the `DBOS_SYSTEM_DATABASE_URL` environment variable to your database connection string):

```bash
npx dbos postgres start
```

3. Start both of this example's services: an Express.js web server (`server.ts`) and a DBOS worker (`worker.ts`):

```shell
./launch_app.sh
```

Visit http://localhost:3000 to see the app!
