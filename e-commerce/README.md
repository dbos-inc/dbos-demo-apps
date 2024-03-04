# DBOS E-Commerce Demo Apps

This demo is a pair of [DBOS](https://github.com/dbos-inc/dbos-sdk) based systems demonstrating an 
e-commerce scenario with separate apps for the online shop and the payment provider.

## Demo Setup

This demo requires Node 20.x or later and a PostgreSQL compatible database.
The demo includes a script to configure a PostgreSQL Docker container on your behalf.

### npm install 

This demo includes four separate packages: the website and the backend for shop and payment.
Each of these packages must be initalized via `npm install` as a first step. 
The demo includes `npm-install.sh` script that will run `npm install` for each package in the demo.

### Database Configuration (Docker)

If you're using the docker configuration script, simply run the `start_postgres_docker.sh` script. 
Before running the script, you must set the `PGPASSWORD` environment variable to the superuser password that will be used.
This script will run a PostgreSQL 16.0 database container, create the shop and payment databases and configure the appropriate schemas.

### Database Configuration (local)

If you're using your own PostgreSQL database, you need to configure the hostname, port, username and password for each of the backend packages.
Each backend package needs its own database, but they can be on the same PostgreSQL server.
There is an `dbos-config.yaml` file in each of the backend package directories. 
These config files must be updated to the appropriate settings for your PostgreSQL server.

> Note, the PostgreSQL user specified for both backend packages *MUST* have database creation permissions.

Here is a snippet of a `dbos-config.yaml` file showing the database connection settings that must be updated:

```yaml
database:
  hostname: 'localhost'
  port: 5432
  username: 'postgres'
  password: ${PGPASSWORD}
```

Once the `dbos-config.yaml` files have been updated, you also need to create the two demo databases `shop` and `payment`.
The `start_postgres_docker.sh` script does this by calling `CREATE DATABASE shop;` and `CREATE DATABASE payment;` 
via [psql](https://www.postgresql.org/docs/current/app-psql.html) in the docker container.

Additionally, you need to configure the schemas for those databases via the `npm run db:setup` command in each of the backend package folders.
Both shop and payment use [knex.js](https://knexjs.org/) as a database access library to manage migrations and seed data.

### Run the Demo

Each of the four parts of the demo must run in its own terminal window.
For each setup, each package has a single npm command that is used to build and launch the package.

* For payment-backend and shop-backend, run `npm run build` and `npx dbos-sdk start` to build and launch the app, respectively.

* For shop-frontend, run `npm run dev` to launch the app.
* To run with a backend in the cloud, export NEXT_PUBLIC_SHOP_BACKEND=<url to shop backend>.

* for cloud update the urls in dbos-config.yaml to point to cloud.

> If you are using VSCode, there are launch configurations for each individual package in the demo.
> Additionally, there are compound configurations for launching the front and backend of shop or payment.
> as well as a compound configuration for launching all four packages in the E-Commerce demo.

## Demo Walkthrough

Once all four processes are running, navigate to http://localhost:3000. 
You will be presented with a simple web shop for purchasing extremely high quality writing utensils.

Before adding a writing utensil to your cart, you must first create an account and login.
Press the "Login" button in the navigation bar to register a username and password.
Then use that username and password to login.

After you successfully login, you will be redirected back to the shop home page. 
Add one or more writing utensils to your cart then press "Proceed to Checkout".
The checkout page will display a summary of your order. 

Pressing "Proceed to Checkout" on the summary page redirects you to the payment page.
Note that this app is running on a different localhost port (defaults of 8086 for payment vs. 3000 for shop) to simulate a different web site.
The payment page will display a similar summary of your order along with buttons to submit or cancel payment.
Pressing Cancel Payment will redirect you back to the shop, with your cart intact.
Pressing Submit Payment simulates entering your payment information, redirecting you back to shop indicating your payment was successful.
When a payment is submitted, your shopping cart is cleared automatically.

## Under the Covers

> Note, this section assumes you have read at least the [DBOS Getting Started docs](https://docs.dbos.dev/category/getting-started).

Each backend package in this demo has a single [reliable workflow](https://docs.dbos.dev/tutorials/workflow-tutorial) at its core.
The following sections show the code for that workflow, along with detailed notes regarding how it works.
Each package also has [transaction](https://docs.dbos.dev/tutorials/transaction-tutorial),
[communicator](https://docs.dbos.dev/tutorials/communicator-tutorial) 
and [handler](https://docs.dbos.dev/tutorials/http-serving-tutorial) functions.
These functions are fairly straightforward, please see the source code for more details.

### Shop paymentWorkflow

```ts
@Workflow()
static async paymentWorkflow(ctxt: WorkflowContext, username: string, origin: string): Promise<void> {
```

Like all DBOS functions, `paymentWorkflow` is a static method on a class, in this case named `Shop`.
DBOS workflows must be decorated with `@Workflow()` and have a `WorkflowContext` as the first parameter.

```ts
  const productDetails = await ctxt.invoke(Shop).getCart(username);
  if (productDetails.length === 0) {
    await ctxt.setEvent(checkout_url_topic, null);
    return;
  }

  const orderID = await ctxt.invoke(Shop).createOrder(username, productDetails);

  const valid: boolean = await ctxt.invoke(Shop).subtractInventory(productDetails);
  if (!valid) {
    await ctxt.setEvent(checkout_url_topic, null);
    return;
  }
```

The workflow starts off with some basic database operations.
Each of these database operations is implemented via a [transaction function](https://docs.dbos.dev/tutorials/transaction-tutorial).
The workflow retrieves the user's shopping cart, creates an order from cart items and subtracts the items from inventory. 
If there are no items in the cart or there isn't sufficient inventory to fulfill the order, the workflow fails.
The `setEvent` call in the failure paths will be described shortly.

Once we have done the local database operations to create the order, we need to call out to the payment provider to start
a payment session and get a payment redirection URL.

```ts
  const paymentSession = await ctxt.invoke(Shop).createPaymentSession(productDetails, origin);
  if (!paymentSession?.url) {
    await ctxt.invoke(Shop).undoSubtractInventory(productDetails);
    await ctxt.setEvent(checkout_url_topic, null);
    return;
  }
```

Assuming the order can be fulfilled, `paymentWorkflow` calls out to the payment provider via a [communicator function](https://docs.dbos.dev/tutorials/communicator-tutorial).
In a real-world shop using a real-world payment provider such as Stripe, `createPaymentSession` would likely use a client SDK from the payment provider.
Since this is a demo, raw `fetch` calls are used instead.

Note that if the payment session does not have a url field, we undo the earlier update to the product inventory.
Since DBOS workflows are guaranteed to reliably complete, even in the face of hardware failures, we will never leave product inventory unaccounted for.

Once we have the payment session, we need to redirect the user to the provided URL and wait for them to complete the payment workflow.
We do this by calling `setEvent` to communicate out to the host environment and `recv` to wait until we receive notification that the payment workflow has completed.

```ts
  await ctxt.setEvent(checkout_url_topic, paymentSession.url);
  const notification = await ctxt.recv<string>(checkout_complete_topic, 60);
```

The `webCheckout` [Http handler](https://docs.dbos.dev/tutorials/http-serving-tutorial) function that called `paymentWorkflow`
uses `getEvent` to wait for the `paymentWorkflow` to provide the payment redirection URL.

```ts
  // from webCheckout function
  const handle = await ctxt.invoke(Shop).paymentWorkflow(username, origin);
  const url = await ctxt.getEvent<string>(handle.getWorkflowUUID(), checkout_url_topic);
  if (url === null) {
    ctxt.koaContext.redirect(`${origin}/checkout/cancel`);
  } else {
    ctxt.koaContext.redirect(url);
  }
```

This code in `webCheckout` also explains the `await ctxt.setEvent(checkout_url_topic, null);` calls in the failure paths of `paymentWorkflow`.
The HTTP handler function that called `paymentWorkflow` is blocked waiting for payment session to be created.
If the payment session doesn't get created, `paymentWorkflow` sends a null value for the `checkout_url_topic` event to unblock the HTTP handler function.

Note that even though the `webCheckout` function will complete and return after receiving the event, the `paymentWorkflow` is still running. 
It is waiting on a `checkout_complete_topic` message before continuing. 
For more on events and messages, please see [Workflow Communications](https://docs.dbos.dev/tutorials/workflow-communication-tutorial)

```ts
  const notification = await ctxt.recv<string>(checkout_complete_topic, 60);

  if (notification && notification === 'paid') {
    // if the checkout complete notification arrived, the payment is successful so fulfill the order
    await ctxt.invoke(Shop).fulfillOrder(orderID);
    await ctxt.invoke(Shop).clearCart(username);
  } else {
    // if the checkout complete notification didn't arrive in time, retrieve the session information 
    // in order to check the payment status explicitly 
    const updatedSession = await ctxt.invoke(Shop).retrievePaymentSession(paymentSession.session_id);
    if (!updatedSession) {
      ctxt.logger.error(`Recovering order #${orderID} failed: payment service unreachable`);
    }

    if (updatedSession.payment_status == 'paid') {
      await ctxt.invoke(Shop).fulfillOrder(orderID);
      await ctxt.invoke(Shop).clearCart(username);
    } else {
      await ctxt.invoke(Shop).undoSubtractInventory(productDetails);
      await ctxt.invoke(Shop).errorOrder(orderID);
    }
  }
}
```

Once the `checkout_complete_topic` message is received, `paymentWorkflow` continues executing. '
Note that the `recv` call has a 60 second timeout. 
So it is possible for the workflow to continue even if the payment notification hasn't been received.

If the notification is received and indicates the user paid, we finalize the order and clear the user's cart.
If the notification is not received, the workflow attempts to reestablish the payment session.
The code is written this way in case there is a hardware failure while waiting for the notification.
The developer cannot depend on the workflow local variables being consistent for the entire workflow execution.
If there is a hardware failure, the workflow will be restarted but transaction and communicator calls that have already occurred will *NOT* be executed again.

The only remaining aspect of this workflow is the source of the `checkout_complete_topic` message.
When calling out to the payment system, the shop backend provided a webhook callback URL as well as the unique UUID of the workflow instance.
When the payment system is done processing a payment, it calls back the HTTP handler listening on this path to provide the payment details.
The HTTP handler forwards the payment details to the workflow instance via the `send` method. 
 
```ts
@PostApi('/payment_webhook')
static async paymentWebhook(ctxt: HandlerContext): Promise<void> {
  const req = ctxt.koaContext.request;

  type Session = { session_id: string; client_reference_id?: string; payment_status: string };
  const payload = req.body as Session;

  if (!payload.client_reference_id) {
    ctxt.logger.error(`Invalid payment webhook callback ${JSON.stringify(payload)}`);
  } else {
    ctxt.logger.info(`Received for ${payload.client_reference_id}`);
    await ctxt.send(payload.client_reference_id, payload.payment_status, checkout_complete_topic);
  }
}
```

## OpenAPI-based DBOS clients

The `@dbos-inc/dbos-openapi` package provides an `generate` command that generates an [OpenAPI 3.0.3](https://www.openapis.org/)
definition for a DBOS project.
This specification can be used to automatically generate strongly typed client code to invoke DBOS HTTP endpoints.
The E-Commerce app demonstrates this approach.

> Note: Typically, assets such as the generated OpenAPI definition and client code would be generated during the build process instead of checked into the source code repository.
> For these demo apps, we have added the generated files to this repository in order to minimize the effort for developers trying out the demo.
> This section describes the steps we went through to produce the OpenAPI definition and the client code.

### Generate OpenAPI Definition

Both the shop and payment backend projects are DBOS projects that have `src/operations.ts` as their operations entrypoint file.
To generate an OpenAPI definition for a DBOS project, run the `dbos-openapi generate` command from a terminal like this:

``` shell
# run this in the <root>/e-commerce/payment-backend and <root>/e-commerce/shop-backend folders
npx dbos-openapi generate src/operations.ts
```

This will generate the OpenAPI definition file for the project and save it to the `src/openapi.yaml` path.

### Generate Client Code

The shop backend folder contains a `create-openapi-client.sh` script that executes the OpenAPI Generator Docker image
against the generated OpenAPI definition file (specifying the appropriate generator) and moves the generated code into the
appropriate frontend project.

There are a variety of tools from different vendors to generate client code from an OpenAPI definition
such as [Swagger CodeGen](https://swagger.io/tools/swagger-codegen/) and [Microsoft Kiota](https://learn.microsoft.com/en-us/openapi/kiota/overview).
For this demo, we used [OpenAPI Generator](https://openapi-generator.tech/).
OpenAPI Generator provides a variety of generators targeting different languages and runtimes.
We used [typescript-fetch](https://openapi-generator.tech/docs/generators/typescript-fetch) for shop
and [typescript-node](https://openapi-generator.tech/docs/generators/typescript-node) for payment.

Installing the [OpenAPI Generator CLI](https://openapi-generator.tech/docs/installation) requires Java runtime support.
They also provide a [Docker image](https://openapi-generator.tech/docs/installation#docker) that acts as a standalone executable.
