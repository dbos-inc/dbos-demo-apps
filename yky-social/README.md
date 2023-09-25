# Operon Social Demo App (YKY)

Note, this demo requires two separate processes to run: the front end, and the back end.
(And the PG database.)


## Configure database

This demo assumes there is a PostgreSQL database running on localhost on port 5432 (configurable, see below).
To set up Postgres (creating a `socialts` user and database), run:

```shell
yky-social/scripts/init_postgres.sh
```

This script will ask you multiple times for the PostgreSQL password, unless it is already stored in the PGPASSWORD environment variable.

## Compile and Run the Backend

### Backend Environment Variables 

Launch a window to run the YKY backend.
The backend allows the following environment variables (as configured above):

* POSTGRES\_HOST=localhost
* POSTGRES\_PORT=5432 POSTGRES\_USERNAME=socialts
* POSTGRES\_PASSWORD=socialts
* POSTGRES\_DATABASE=socialts

Additionally, to allow media storage (work in progress), you need S3 access keys.
* AWS\_ACCESS\_KEY
* AWS\_SECRET\_ACCESS\_KEY

By default, the backend will run on port 3000.

### Build and Run Backend

> At this time, the core Operon package has not been published to NPM. In order to run the Operon demos,
> the core [Operon repo](https://github.com/dbos-inc/operon) needs to be cloned and built locally.

Change to the `yky-social` directory and install dependencies:

```shell
npm install
npm link <path to local operon repo>
```

Once the dependencies are installed, build and run the backend:

```shell
npm run build
npm run dev
```

## Run YKY FrontEnd

To launch the frontend server, open a third terminal window and run:

```shell
    cd yky-social/yky
    npm run dev
```

The YKY front end website is hosted on `localhost:3001` by default. 
