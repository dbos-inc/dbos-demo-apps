# Bank of Operon

This is a simple bank application that uses [Operon](https://github.com/dbos-inc/operon) as the backend framework.
It requires node version 18.

### Initialize Postgres database
You'll need to start a Postgres server, either through Docker, running locally, or using RDS. We provide a script to start a Postgres docker:
```shell
./scripts/start_postgres_docker.sh
```

Then, you can set up the database using:
```shell
./scripts/init_postgres.sh
```

### Start a Keycloak authentication server
We use Keycloak to perform authentication and we provide a script to automatically start it in a docker container.
You can simply run:
```shell
./scripts/start_keycloak_docker.sh
```

### Start a Jaeger tracing server
We use Jaeger to visualize traces of Operon operations. We provide a script to automatically start it in a docker container:
```shell
./scripts/start_jaeger_docker.sh
```

### Start the backend
To compile and run the bank backend, enter the `bank-backend/` directory and install dependencies:
```shell
cd bank-backend/
npm install
```

Then, you need to use `npm link` to install the Operon package:
```shell
npm link <operon repo path>
```

If you just created a database, you can configure your database path in the `.env` file and create tables using Prisma:
```shell
# .env sets default database url to: DATABASE_URL="postgresql://bank:bank@localhost:5432/bank?schema=prisma"
npx prisma migrate dev --name init
```

Finally, compile and run the backend:
```shell
npm run build
npm start
```
It will listen at http://localhost:8081 

### Start the frontend
We build a bank frontend using Angular. To start the frontend, enter the `bank-frontend` directory and insatll dependencies:
```shell
cd bank-frontend/
npm install
```

Then, you can compile and serve the frontend.
```shell
npm start
```

Now, you should be able to view the bank website in your browser: http://localhost:8089/

You can see traces via the Jaeger UI: http://localhost:16686/