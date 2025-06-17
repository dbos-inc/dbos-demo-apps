# Fault-Tolerant Checkout

In this example, we use DBOS and Fastify to build an online storefront that's resilient to any failure.

### Developing Locally

First, set the `DBOS_DATABASE_URL` environment variable to a connection string to your Postgres database.

Then, install dependencies, build your app, and set up its database tables:

```shell
npm install
npm run build
npm run db:setup
```

Then, start it:

```shell
npm run start
```

Alternatively, run it in dev mode using `nodemon`:

```shell
npm install
npm run dev
```

Visit [`http://localhost:3000`](http://localhost:3000) to see your app!

<details>
<summary><strong>Deploying via the DBOS Cloud CLI</strong></summary>

You can also deploy this app to DBOS Cloud via the Cloud CLI.
Install it globally with this command:

```shell
npm i -g @dbos-inc/dbos-cloud@latest
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

</details>

## Usage

Visit the main app page for an opportunity to buy a widget! Buying a widget decrements the remaining inventory. Clicking "Buy Now" takes you to a confirmation page that simulates payment processing.

The Shop Internals section shows the current inventory and order status of all orders. For each order, after it has been paid, it takes a few more internal steps to process and dispatch it. This is represented by the 'Progress until dispatch' column of the orders table, and is updated every second. If the app crashes while an order is still being processed, it will resume exactly where it left off once the app restarts.

The Server Tools section give you an opportunity to crash the app. After crashing, any in-progress payment page will momentarily become inaccessible but then recover to its appropriate state, allowing you to continue where you left off. After payment has been confirmed or denied for a specific worklow, revisiting `/?payment=old-ID` will not change the settled order.
