# Operon Social Demo App (YKY)

This demo shows an [Operon](https://github.com/dbos-inc/operon) backend system coupled with a next.js frontend.

It simulates a simple social network, and demonstrates:
* Use of Operon workflows, transactions, and communicators
* [TypeORM](https://typeorm.io) integration
* Amazon S3 integration (for profile photos)
* Authentication and authorization using an app-managed database table

## Create Database

This demo assumes there is a PostgreSQL database running on localhost on port 5432 (configurable, see below).
To set up Postgres (creating a `socialts` user and database) with a local database, run:
```shell
yky-social/scripts/init_pgdb.sh
```
This script will ask you multiple times for the PostgreSQL password, unless it is already stored in the PGPASSWORD environment variable.


Alternatively, set up the database with Docker:
```
sudo sh -c "POSTGRES_HOST=localhost POSTGRES_PORT=5444 POSTGRES_USERNAME=socialts POSTGRES_PASSWORD=socialts POSTGRES_DATABASE=socialts scripts/start_postgres_docker.sh"
```

## Compile and Run the Backend

### Backend Environment Variables 

Launch a window to run the YKY backend.
The backend allows the following environment variables (as configured above):

* POSTGRES\_HOST=localhost
* POSTGRES\_PORT=5444
* POSTGRES\_USERNAME=socialts
* POSTGRES\_PASSWORD=socialts
* POSTGRES\_DATABASE=socialts

Additionally, to allow media storage, S3 access keys must be placed in the environment or in `operon-config.yaml`:
* AWS\_REGION
* AWS\_ACCESS\_KEY
* AWS\_SECRET\_ACCESS\_KEY

By default, the backend will run on port 3000, but this can be changed with 

### Build and Run Backend

Change to the `yky-social` directory, install dependencies, and build the backend:

```shell
npm install
npm run build
```

Once the backend code is ready, create the database schema, and start the backend:

```shell
npm run createschema
npx operon start -p 3000
```

## Run YKY FrontEnd

To launch the frontend server, open a third terminal window and run:

```shell
    cd yky-social/yky
    npm run dev
```

The YKY front end website is hosted on `localhost:3001` by default. 
