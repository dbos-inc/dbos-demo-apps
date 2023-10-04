## Bank of Operon -- Backend

This backend re-implements functionalities [here](https://github.com/dbos-inc/reference-demo-apps/tree/main/bank/bank-koa-server) using Operon.

### Initialize Postgres database
You'll need to start a Postgres server, either through Docker, running locally, or using RDS. We provide a script to start a Postgres docker:
```shell
../scripts/start_postgres_docker.sh
```

Then, you can set up the database using:
```shell
../scripts/init_postgres.sh
```

### Start a Keycloak authentication server
We use Keycloak to perform authentication and we provide a script to automatically start it in a docker container.
You can simply run:
```shell
../scripts/start_keycloak_docker.sh
```

### Start a Jaeger tracing server
We use Jaeger to visualize traces of Operon operations. We provide a script to automatically start it in a docker container:
```shell
../scripts/start_jaeger_docker.sh
```

You can see traces via the Jaeger UI: http://localhost:16686/

### Start the backend using Operon
First, install dependencies.
```shell
npm ci
```

If you just created a database, you can configure your database path in the `.env` file and create tables using Prisma:
```shell
# .env sets default database url to: DATABASE_URL="postgresql://bank:bank@localhost:5432/bank?schema=prisma"
npx prisma migrate dev --name init
```

Then compile this app:
```shell
npm run build
```

Finally, start the simple HTTP server using Operon CLI:
```shell
npx operon start
```

Now by default, the bank backend should start at `http://localhost:8081`! You can now send HTTP requests to its REST endpoints, or connect it with the frontend.