# Bank of Operon

This is a simple bank application that uses [Operon](https://github.com/dbos-inc/operon) as the backend framework.
It requires node version 18 and Docker.

In this tutorial, you will set up a Postgres `bank` database, start a Keycloak server for authentication, start two backend servers, start a frontend server that connects to both backends, and use Jaeger to visualize backend operations.

### Pre-requisite

#### Start PostgreSQL
First, let's set up a Postgres database. Please make sure you set `PGPASSWORD` environmental variable before you start!

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
We import a default [dbos realm](./scripts/dbos-realm.json) with the admin name and password (you can use it to log in Keycloak's admin console):
```
dbos-admin / dbos-pass
```
We also pre-populate two example users so you can login from the bank frontend. Here are their emails and passwords:
```
john@test.com / 123    # This has an "appUser" role.
mike@other.com / pass  # This has an "appAdmin" role
```

For more information about Keycloak, please visit [Keycloak guides](https://www.keycloak.org/guides#server).

### Start two backend servers
To compile and run the bank backend, enter the `bank-backend/` directory and follow the instructions [here](bank-backend/README.md).

### Start the frontend
We build a bank frontend using Angular. To start the frontend, enter the `bank-frontend/` directory and follow the instructions [here](bank-frontend/README.md).