# Operon Bank Demo App

This is a simplified bank application that uses [Operon](https://github.com/dbos-inc/operon) as the backend framework.
It requires Node 18.x or later and Docker.

In this tutorial, you will set up a Postgres `bank` database, start a Keycloak server for authentication, start two backend servers (we will run bank transactions across them), start a frontend server that connects to both backends, and optionally use Jaeger to visualize backend operations.
Especially, bank uses [Prisma](https://www.prisma.io/) to manage the user database.

## Run the Demo

### Pre-requisite

#### Install Dependencies

This demo includes two packages: the web frontend and the backend.
You need to run `npm install` under each of the [`bank-frontend/`](./bank-frontend/) and [`bank-backend/`](./bank-backend/) directories as a first step.

#### Start PostgreSQL
Now, let's set up a Postgres database. Please make sure you set `PGPASSWORD` environmental variable before you start!

We provide a convenient script to start a Postgres server in a docker container:
```shell
./scripts/start_postgres_docker.sh
```
This script sets up a new user `bank` that owns the database `bank`, and creates a `keycloak` schema in the `bank` database so we can proceed to our next step.

#### Start Keycloak
[Keycloak](https://www.keycloak.org/) is a popular Identity and Access Management solution.
We use Keycloak to manage user authentication for our bank application.
We provide a script to start a Keycloak server in a docker container:
```shell
./scripts/start_keycloak_docker.sh
```
You can visit `http://localhost:8083/` after the Keycloak server is started.
We import a default [dbos-realm](./scripts/dbos-realm.json) with the admin name and password (you can use it to log in Keycloak's admin console):
```
dbos-admin / dbos-pass
```

For more information about Keycloak, please visit [Keycloak guides](https://www.keycloak.org/guides#server).

### Start two backend servers
Each backend server must run in its own terminal window because we will configure different environmental variables for them.
Especially, you need to set `PGPASSWORD` to the one you used to create the `bank` database, and set `BANK_SCHEMA` to the namespace you wish to use for the specific bank server.
In this tutorial, let's set `export BANK_SCHEMA=bank1` for the first server, and in a separate terminal, set `export BANK_SCHEMA=bank2` for the second server.

In the terminal with `BANK_SCHEMA=bank1`, enter the `bank-backend/` directory, set up the database with Prisma, compile, and start the server at port `8081`:
```bash
# Create tables under the bank1 schema.
npx prisma migrate dev --name initbank1

npm run build
npx operon start -p 8081
```

In the terminal with `BANK_SCHEMA=bank2`, enter the `bank-backend/` directory, set up the database with Prisma, and start the server at port `8082`:
```bash
# Create tables under the bank2 schema.
npx prisma migrate dev --name initbank2

npx operon start -p 8082
```

Now both backend servers are up, let's move to the bank frontend!

### Start the frontend

We build a simple bank frontend using [Angular](https://angular.io/). To start the frontend, enter the `bank-frontend/` directory and run:
```bash
npm start
```

## Demo Walkthrough

Once you finish all previous steps, navitage to http://localhost:8089/
You will be presented with a welcome page.
Press the `Login` button and the webpage should redirect to a login page from Keycloak.

We pre-populate two example users so you can use the following emails and passwords to login:
```
john@test.com / 123    # This has an "appUser" role.
mike@other.com / pass  # This has an "appAdmin" role
```

Once you successfully log in, the frontend should re-direct you to the home page of the bank user.
The drop-down menu at the top allows you switch between two bank servers (bank1 at port 8081 and bank2 at port 8082) we just started.
There are three buttons in the middle:
- "New Greeting Message" fetches a greeting message from the backend and displays it in the "Message from Bank" banner above.
- "Create a New Account" creates a new checking account for the current user. If you logged in as `john@test.com`, pressing this button would fail because this user lacks the "appAdmin" permission to create a new account.
- "Refresh Accounts" refreshes the list of accounts of the current user.

Now, log in as `mike@other.com`.
Once you click "Create a New Account" several times in both bank1 and bank2, you will see a list of accounts displayed with their `Account ID`, `Balance`, `Type`, and `Actions`. Initially, all accounts have zero balance.
Select the "Choose an Action" drop-down menu next to each account, you will see several options:
- "Transaction History" displays a list of past transactions from latest to oldest.
- "Deposit" allows you to make a deposit from either cash or from an account in another bank backend.
- "Withdraw" allows you to make a withdrawal to either cash or to an account in another bank backend.
- "Internal Transfer" allows you to transfer between your own accounts within the same bank backend.

Sometimes the JWT token would expire and cause failures. You can refresh the page and try again. Refreshing the webpage obtains a new token.

### (Optional) Visualize Tracing
We use [Jaeger Tracing](https://www.jaegertracing.io/) to visualize traces of Operon operations. We provide a script to automatically start it in a docker container:
```bash
./scripts/start_jaeger_docker.sh
```
Once it starts, you will see traces via the Jaeger UI: http://localhost:16686/

## Under the Covers

> Note, this section assumes you have read at least the [Operon Getting Started docs](https://docs.dbos.dev/category/getting-started).

(Coming soon!)