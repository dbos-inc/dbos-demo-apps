## Bank of Operon -- Backend

The goal of this app is to show how we use Operon to construct transactions and workflows of a simple banking app.
This app also demonstrates JWT-based authentication and Jaeger tracing with Operon.

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
# .env sets default database url to: DATABASE_URL="postgresql://bank:${PGPASSWORD}@localhost:5432/bank?schema=${BANK_SCHEMA}"
# Please make sure you set these two environmental variables correctly.
export PGPASSWORD=<your database password>
export BANK_SCHEMA=<schema for this bank>
npx prisma migrate dev --name init
```

Then compile this app:
```shell
npm run build
```

You can run tests and make sure everything works properly:
```shell
npm test
```

Finally, start the simple HTTP server using Operon CLI:
```shell
npx operon start
```

Now by default, the bank backend should start at `http://localhost:8081`! You can now send HTTP requests to its REST endpoints, or use it with the [frontend](../bank-frontend/).