# Operon Shop Demo App

Note, this demo requires three separate processes to run: the front end, the back end and the Stripe webhook listener.

## Configure Stripe 

The Operon Shop Demo uses [Stripe](https://stripe.com/) to simulate payment processing (test API only).

First, sign up for a [Stripe](https://stripe.com/) account if you don't already have one.

Next, install the [Stripe CLI](https://stripe.com/docs/stripe-cli) on the demo machine and log in via `stripe login`.
Logging into Stripe will generate a restricted use Stripe API key that will allow you to make test payments.

Execute the `stripe config --list` command and make note of the `test_mode_api_key` value. 
You will need that key later when configuring the Shop backend process.

### Run the Stripe Webhook Listener

Start the Stripe webhook listener via the following command:

```shell
stripe listen --forward-to localhost:8082/stripe_webhook
```

Make note of the `webhook signing secret` this command prints to the console. 
This value wil also be needed later when configuring the Shop backend process.

## Configure PostgreSQL Database

This demo requires a PostgreSQL database running on localhost on port 5432 with a `shop` database.

### PostgreSQL Docker Container

We have provided a shell script `start_postgres_docker.sh` to start a PostgreSQL Docker container and create the `shop` database.
Note, this script requires the `PGPASSWORD` environment variable to be set. This value is used as the PostgreSQL superuser password.

### Scehma and Seed Data

The Operon Shop Demo uses [Knex](https://knexjs.org/) for its database interaction logic.
The `setup` NPM script in `shop/backend-operon/package.json` will automatically configure the `shop` database with the correct schema and seed data.
Like the PostgreSQL Docker Container section above, this script requires the PostgreSQL superuser password to be specified via the `PGPASSWORD` environment variable.

From the `shop/backend-operon` directory, configure the `shop` database schema and seed data via these commands:

```shell
npm install
npm run setup
```

## Compile and Run the Shop Backend

> Note, the `operon-demo-apps` repo provides VSCode debugger launch configurations for the Shop demo. 
> You can use these configurations to run the backend, frontent or both under the debugger.

### Backend Environment Variables 

With the Stripe Webhook Listener running in the first terminal window, launch a second window to run the Shop backend.
The Shop Backend requires the following environment variables:

* PGPASSWORD, set to the PostgreSQL superuser password as described in the Configure database section above
* STRIPE_API_KEY, set to the `test_mode_api_key` value returned by `stripe config --list`
* STRIPE_WEBHOOK_SECRET, set to the `webhook signing secret` value printed when `stripe listen` was run

> Note, if you put these values in the `shop/backend-operon/.env` file, the VSCode debugger will use them automatically  
> when debugging the Shop backend.

### Build and Run Backend

From the `shop/backend-operon` directory, build and run the Shop backend via these commands:

> Note, we installed NPM dependencies above in the Scehma and Seed Data section.

```shell
npm run build
npx operon start -p 8082
```

## Run Shop Frontend

From the `shop/shop-app-ts` directory, run the Shop front end via this command:

```shell
npm run dev
```

## Running the demo

Navigate to `http://localhost:3000` to access the Operon Shop Demo front end.

When testing checkout, the Operon Shop Demo will redirect to a [Stripe](https://stripe.com/) testing payment page.
Use the credit card number `4242-4242-4242-4242` with any three digit CVC and future expiration date to test the payment workflow.
For more information on Stripe testing, see [this link](https://stripe.com/docs/testing#cards).