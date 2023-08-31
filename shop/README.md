# Operon Shop Demo App

Note, this demo requires three separate processes to run: the front end, the back end and the Stripe webhook listener.


## Configure database

This demo assumes there is a PostgreSQL database running on localhost on port 5432. 
To set up Postgres (creating a `shop` user and database), run:

```shell
shop/scripts/init_postgres.sh
```

This script will ask you multiple times for the PostgreSQL password, unless it is already stored in the PGPASSWORD environment variable.

## Configure Stripe 

The Operon Shop Demo uses [Stripe](https://stripe.com/) to simulate payment processing (test API only).

First, sign up for a [Stripe](https://stripe.com/) account if you don't already have one.

Next, install the [Stripe CLI](https://stripe.com/docs/stripe-cli) on the demo machine and log in via `stripe login`.
Logging into Stripe will generate a restricted use Stripe API key that will allow you to make test payments.

Execute the `stripe config --list` command and make note of the `test_mode_api_key` value. 
You will need that key later when configuring the Shop backend process.

## Run the Stripe Webhook Listener

Start the Stripe webhook listener via the following command:

```shell
stripe listen --forward-to localhost:8082/stripe_webhook
```

Make note of the `webhook signing secret` this command prints to the console. 
This value wil also be needed later when configuring the Shop backend process.

## Compile and Run the Shop Backend

### Backend Environment Variables 

With the Stripe Webhook Listener running in the first terminal window, launch a second window to run the Shop backend.
The Shop Backend requires the following environment variables:

* PGPASSWORD, set to the PostgreSQL password as described in the Configure database section above
* STRIPE_API_KEY, set to the `test_mode_api_key` value returned by `stripe config --list`
* STRIPE_WEBHOOK_SECRET, set to the `webhook signing secret` value printed when `stripe listen` was run

> Note, if you put these values in the `shop/.env` file, the VSCode debugger will pick them up automatically if you 
> debug the `Launch Shop Backend` launch configuration.

### Build and Run Backend

> At this time, the core Operon package has not been published to NPM. In order to run the Shop backend,
> the core [Operon repo](https://github.com/dbos-inc/operon) needs to be cloned and built locally.

Change to the `shop/backend-operon` directory and install dependencies:

```shell
npm install
npm link <path to local operon repo>
```

Once the dependencies are installed, build and run the backend:

```shell
npm run build
npm start
```

> Note, you can build & debug the backend in VSCode via the `Launch Shop Backend` launch configuration.

## Run Shop FrontEnd

To launch the frontend server, open a third terminal window and run:

```shell
    cd shop/shop-app-ts
    npm run dev
```

The Shop front end website is hosted on `localhost:3000`. 