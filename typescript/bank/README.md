# DBOS Bank Demo App

DBOS Bank Demo App is a simplified bank application that uses [DBOS Transact](https://github.com/dbos-inc/dbos-sdk) as the backend framework.

This demo shows simple database operations using [Prisma](https://www.prisma.io), integration with an [AngularJS](https://angularjs.org/) front end, and highlights use of workflows to keep two databases (owned by different entities) in sync without distributed transactions.  Digging slightly deeper, the demo also shows DBOS role-based security, and how to integrate with OAuth-based single-sign-on, and use of [Jaeger](https://www.jaegertracing.io/) for tracing during development.

The demo requires Node 20.x or later and optionally uses Docker to simplify setup.

## Demo Overview

The DBOS Bank Demo App simulates a simplified bank teller interface, allowing account creation, deposit, withdrawal, and funds transfer between accounts and banks.  There regular users, which can handle deposit, withdrawal, and transfer, as well as administrators, who can additionally create accounts.

### Introduction To Bank Transfer Operations

The transfer of funds between banks has never relied on [distributed transactions](https://en.wikipedia.org/wiki/Distributed_transaction) in the academic sense.
Nor is it possible to use mechanisms such as [two-phase-commit](https://en.wikipedia.org/wiki/Two-phase_commit_protocol) to implement the behavior of the banking system, which accomodates paper checks, fraud protections, and so on, that leave work outstanding for several days.
Accurate, reliable interbank transfers [predate widespread electronic systems by over a century](https://cacm.acm.org/opinion/victorian-data-processing/).
Many features (such as the ability to write checks on paper) along with associated artifacts (bad checks, disputed charges, and processes to deal with them) remain in modern banking.
So, banking remains a system of requests, settlements/reconciliation, and compensating actions, rather than a system of near-instant ACID transactions.

### DBOS Bank Transfer Model

Many interbank transactions rely on a third-party [clearing house](https://en.wikipedia.org/wiki/Automated_clearing_house).
However, this DBOS Bank Demo App acts more like a [wire transfer](https://en.wikipedia.org/wiki/Wire_transfer), where banks send messages to each other directly.

Of course the demo is simplified: it does not use [SWIFT](https://en.wikipedia.org/wiki/SWIFT) or a similar standard network for messaging, nor is the settlement process (wherein the sending bank transfers some real assets to the receiving bank) implemented.

The demo does, however:

* Verify that the sending account has funds available to send
* Put a hold on funds during the course of transfer
* Send the transfer request to another bank server
* Credit the recipients account and deduct from the sender's account

The DBOS Bank Demo App ensures that either both accounts are affected, or neither is, regardless of any functional or non-functional errors.  This is done with very little error-handling code, and the error-handling code that exists is in support of business requirements (accounts must exist, sender must actually have the money, etc.) rather than for handling hardware or environmental issues.  This means that all the error handling code in DBOS Bank can be easily tested in automated tests; environmental errors are handled by the framework.

## Run the Demo Locally

### Start PostgreSQL

First, let's set up a database for each bank.  Each bank app can have its own database server, but, to simplify deployment, we will put both bank databases under the same Postgres server process.

The demo provides two ways to set up Postgres:
* A script set up a Docker container with Postgres configured
* Use of a preexisting Postgres server

#### Using Docker for Postgres

Set the `PGPASSWORD` environment variable to whatever you'd like, then start Postgres in a Docker container using the `start_postgres_docker` script:
```shell
export PGPORT=5432 # Optional; can be set to a non-default value, but make adjustments below
export PGPASSWORD=<database password>
node ./scripts/start_postgres_docker.js
```
This script sets up two new Postgres users: `bank_a` that owns the database `bank_a`, and `bank_b` that owns database `bank_b`.

Our script uses the same `$PGPASSWORD` for both banks to make things easier to remember for development.  The passwords can be changed in the script if desired.

#### Use an Existing Postgres

If you have an existing Postgres, the following commands can be issued to set up the two bank databases:
```sql
CREATE USER bank_a PASSWORD 'postgres'; -- Feel free to change the passwords
ALTER USER bank_a CREATEDB;
CREATE DATABASE bank_a OWNER bank_a;
CREATE USER bank_b PASSWORD 'postgres';
ALTER USER bank_b CREATEDB;
CREATE DATABASE bank_b OWNER bank_b;
```

### Start Two DBOS Bank Servers
In this tutorial, we'll start two bank servers, respresenting two different banks, and do transactions across them.
First, build the bank application.  In the `bank-backend/` directory, run:

```shell
npm install
npm run build
```

Do a quick review of `dbos-config.yaml`, to make sure the information is correct, especially if you are not using the default database port.  Note that this setup uses the same Postgres server process for both databases for simplicity, but they can easily be separated by making additional changes here.

Next, execute database migrations and launch the first bank.  The first command below uses [Prisma](https://www.prisma.io/) to create tables for the first bank; the second command launches the bank.

```bash
export PGPASSWORD=<database password>
export CURRENT_BANK=bank_a

# Create tables on the bank_a database.
npx dbos-sdk migrate

# Start the bank server on port 8081
npx dbos-sdk start -p 8081
```

Then, in a second terminal window, launch the second bank server, using different values for the environment variables:

```bash
export PGPASSWORD=<database password>
export CURRENT_BANK=bank_b

# Create tables on the bank_b database
npx dbos-sdk migrate

# Start a second bank server on port 8083
npx dbos-sdk start -p 8083
```

### Starting The Frontend

#### Checking the Frontent Environment

First, review the settings in `bank-frontend/src/environments/environment.ts`.
This file contains settings that let the frontend find the bank server(s), so editing it is especially important if you have used any non-default port numbers or URLs:

* bankHosts - this list of strings should provide URLs to the servers and ports that were started above
* authUrl - the bank servers provide a mockup of an OAuth single-sign-on service, so this URL should point to one of them for demo purposes.  A different OAuth service can be specified.
* redirectUrl - the URL for returning to the frontend server, should match the Angular server that will be started next

#### Starting the Angular Server
To start the frontend, enter the `bank-frontend/` directory and run:
```bash
npm install
npm start

# You should see this:
** Angular Live Development Server is listening on localhost:8089, open your browser on http://localhost:8089/ **
```

## Demo Walkthrough
In the walkthrough, we will create some accounts, deposit some funds, and transfer money between banks.
It may help to think of the users of DBOS Bank as tellers and managers, not as end-customers visiting their personal account pages.

Once you finish all previous steps, navigate to http://localhost:8089/.
You will be presented with a welcome page.
Press the `Login` button and the webpage should redirect to a login page from the OAuth single-sign-on provider.

If you are using the mock OAuth built into the DBOS Bank server, you can use the following usernames and passwords to log in:
```
Alice / password  - App User
Bob / password    - App User
Carol / password  - App Administrator (needed to create new accounts)
```

As there are no accounts initially, and start by logging in as an administrator (Carol, using the mock authenticator).  
Once you successfully log in, the frontend should re-direct you to the home page of the bank user.
The drop-down menu at the top allows you to switch between the bank servers (bank\_a at port 8081 and bank\_b at port 8083) we just started.
There are three buttons in the middle:
- "New Greeting Message" fetches a greeting message from the backend and displays it in the "Message from Bank" banner above.
- "Create a New Account" creates a new checking account for the current user.  (While the button exists for everyone, it works for administrators only.  For a description of why we left it that way, see [Authentication and Authorization](#authentication-and-authorization) below.)
- "Refresh Accounts" refreshes the list of accounts of the current user.

Now, once you click "Create a New Account" several times in both bank1 and bank2, you will see a list of accounts displayed with their `Account ID`, `Owner Name`, `Balance`, `Type`, and `Actions`. Initially, all accounts have zero balance.

Select the "Choose an Action" drop-down menu next to each account, you will see several options:
- "Transaction History" displays a list of past transactions from latest to oldest.
- "Deposit" allows you to deposit either from cash or an account in another bank backend.
- "Withdraw" allows you to withdraw either to cash or an account in another bank backend.
- "Internal Transfer" allows you to transfer between accounts within the same bank backend.

Once you have created accounts in both banks, and deposited money into at least one of them, you should be able to transfer money to the other bank with the "Deposit" and "Withdraw" actions.

### (Optional) Visualize Tracing
During development, you can use [Jaeger Tracing](https://www.jaegertracing.io/) to visualize traces of DBOS operations.  We provide a script to automatically start it in a docker container:
```bash
./scripts/start_jaeger_docker.sh
```

Once it starts, you will need to add the following to `dbos-config.yaml` and restart your bank servers:
```yaml
telemetry:
    OTLPExporter:
        tracesEndpoint: http://localhost:4318/v1/traces
```

Then, to see traces via the Jaeger UI, open http://localhost:16686/.


## Under the Covers

> Note, this section assumes you have read at least the [DBOS Getting Started docs](https://docs.dbos.dev/category/getting-started).

The goal of this Bank demo is to highlight two major DBOS features:

1. Reliable orchestration of complex workflows involving multiple database transactions.
2. Declarative authentication and authorization through DBOS middleware and decorators.

The following sections walk you through the code for each feature, along with detailed notes regarding how it works.

### Reliable Cross-Bank Transactions -- `withdrawWorkflow`

We use our [withdraw workflow](./bank-backend/src/workflows/txnhistory.workflows.ts#L218) to show how DBOS can reliably orchestrate a complex business-critical operation like a bank wire transfer.

This workflow performs three steps:
1. Verifies the local withdrawal transaction, and records the transaction locally.
2. If the deposit goes to a remote bank, contact that bank to deposit the same amount of money.
3. If the remote operation fails, undo the local withdrawal transaction, otherwise complete the workflow.

We obviously need to execute these steps reliably, otherwise a withdrawal could succeed without a corresponding deposit, and money would be lost.
DBOS makes this easier by guaranteeing all workflows run to completion, exactly once.  As these steps could span several days in a real bank, it is important that the computers not "drop the ball" and forget to finish these steps, even in the event of network or hardware failures.  And, obviously, the steps should have the effect of executing only once.

DBOS Transact makes this simple to code, as only the "functional" errors (lack of balance, incorrect instructions for the remote bank) have to be implemented, and these can also easily be tested in development.  The "non-functional" errors (server stopping in the middle of processing, network failures) are covered by the framework's guarantees, which is good, because they are very difficult to test for in development.

Let's go through the code.  Here's the signature for our reliable workflow:
```ts
  @DBOS.workflow()
  static async withdrawWorkflow(data: TransactionHistory) {...}
```

Like other DBOS operations, `withdrawWorkflow` is a static method on a class, in this case named `BankTransactionHistory`, and is decorated with `@DBOS.workflow()`.
The argument has a `TransactionHistory` type, which is automatically generated by the [PrismaClient](https://www.prisma.io/docs/concepts/components/prisma-client).

In the first step, the workflow performs a withdrawal transaction to a local account.
We implement it in a [`updateAcctTransactionFunc`](./bank-backend/src/workflows/txnhistory.workflows.ts#L92) function which updates the user balance and appends an entry to the transaction history.  This function will also error (and stop the workflow with no changes made) if there is no such account, or insufficient balance.
The workflow invokes this function and specifies it is a withdrawal:
```ts
// Withdraw locally first.
const result = await BankTransactionHistory
  .updateAcctTransactionFunc(
    data.toAccountId,
    data,
    /*isDeposit=*/ false
  );
```

If the withdrawal transaction fails, it throws an exception and rolls back automatically, additionally failing the workflow.
If the withdrawal transaction succeeds, it returns a bank transaction ID, which can be used later in a compensating action to undo this transaction.

In the second step, the workflow invokes a step that sends an HTTP request to the remote backend server to invoke a `depositWorkflow` which deposits the same amount of money from the remote account:
```ts
const remoteUrl = data.toLocation + "/api/deposit";
const thReq = {
  fromAccountId: data.fromAccountId,
  toAccountId: data.toAccountId,
  amount: data.amount,
  toLocation: "local",
  fromLocation: REMOTEDB_PREFIX + process.env.BANKNAME + ":" + process.env.BANKPORT,
};

const remoteRes: boolean = await BankTransactionHistory
  .remoteTransferComm(
    remoteUrl,
    thReq as TransactionHistory,
    /*workflowUUID=*/ DBOS.workflowID + '-deposit');
```

Note that we pass in `"DBOS.workflowUD + '-deposit'"` as the idempotency key for the remote workflow.  The step sets an HTTP header "dbos-workflowuuid" with this UUID, so DBOS can guarantee that the remote workflow runs exactly once even if the step is retried.

Finally, if the step returns `false` or fails, it means the remote deposit failed and we must undo the previous withdrawal transaction.
This undo transaction increments the user balance and removes the entry from the bank transaction history (we added it in the first step).  Note that this "undo" transaction is a compensating action, doing the reverse of the withdrawal.  Setting the balance back to the previous balance could be wrong,
if any intervening transactions occurred that changed the balance.
```ts
if (!remoteRes) {
  // Undo transaction is a deposit.
  const undoRes = await BankTransactionHistory.updateAcctTransactionFunc(
    data.fromAccountId,
    data,
    /*isDeposit*/ true,
    result
  );
  if (undoRes !== result) {
    throw new Error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
  }
  throw new Error("Failed to deposit to remote bank.");
}
```

DBOS guarantees that this workflow runs to completion and every operation executes exactly once (please see our [idempotency](https://docs.dbos.dev/tutorials/idempotency-tutorial) tutorial for more details), which is crucial for business-critical transactions such as the ones in banking applications.


### Authentication and Authorization

The mock authenticator provides users "Alice" and "Bob" who only have the "appUser" role and are not authorized to create new accounts.  However, the frontend developers accidentally\* left the "Create a New Account" button in the frontend for all users.  Fortunately, the backend developers used DBOS Transact's role-based security, and if you logged in as `Alice` or `Bob`, the "Create a New Account" button will fail to create an account.

\*In a real application, the "Create a New Account" button may not exist, but if `Alice` or `Bob` has hacker inclinations, they may find ways to make the same backend calls, so "client-based security" is not what we want.  We left the "Create a New Account" button in there so you can test out the security protections with minimal work.

Let's take a deeper look at how this is implemented.  In Bank, users authenticate with the frontend via an external OAuth service (or an internal mockup), and then authenticate with the backend via JWT tokens.
Authentication and authorization in the backend proceeds in three steps:
1. Verify the JWT token from the OAuth server using a Koa middleware.
2. Use an authentication middleware to extract user and role information set by the Koa middleware in step 1.
3. The framework checks the authenticated user and roles against the required roles of the target operation.

First, the bank backend uses the [`koa-jwt`](https://github.com/koajs/jwt) middleware for JWT verification:
```ts
import jwt from "koa-jwt";

export const bankJwt = jwt({
  secret: {"..."}
});
```

We declaratively use this Koa middleware (along with a [`koa-logger`](https://github.com/koajs/logger) middleware) by specifying a class level decorator for all classes (`BankEndpoints`, `BankAccountInfo`, and `BankTransactionHistory`):
```ts
@KoaMiddleware(koaLogger, bankJwt)
export class BankEndpoints {...}
```

These two middleware functions are applied to each request from left to right: first, the `koaLogger` middleware logs the request and wraps all subsequent functions so it can correctly log the response; second, the `bankJwt` middleware verifies the JWT token and rejects a request with a `401` status code if the token is invalid.
If the token is valid, the `bankJwt` middleware sets a `state.user` object in the Koa context, which can be used by later middleware -- in our case, the authentication middleware.

In the second step, we write a custom authentication middleware to extract authenticated user and role information set by the Koa middleware:
```ts
export async function bankAuthMiddleware(ctx: MiddlewareContext) {
  // Only extract user and roles if the operation specifies required roles.
  if (ctx.requiredRole.length > 0) {
    if (!ctx.koaContext.state.user) {
      throw new DBOSResponseError("No authenticated user!", 401);
    }

    const authenticatedUser: string = ctx.koaContext.state.user["preferred_username"] ?? "";
    const authenticatedRoles: string[] = ctx.koaContext.state.user["realm_access"]["roles"] ?? [];
    if (authenticatedRoles.includes("appAdmin")) {
      // appAdmin role has more priviledges than appUser.
      authenticatedRoles.push("appUser");
    }
    return {
      authenticatedUser: authenticatedUser,
      authenticatedRoles: authenticatedRoles
    };
  }
}
```

We decorate all classes with `@Authentication(bankAuthMiddleware)` to use this middleware:
```ts
@Authentication(bankAuthMiddleware)
@KoaMiddleware(koaLogger, customizeHandle, bankJwt)
export class BankEndpoints {...}
```

Finally, we declare required roles for our classes and functions, and the framework compares the currently authenticated user and roles against the required ones to authorize a request.
We specify two roles in Bank: "appAdmin" and "appUser".
All classes are decorated with a default required role "appUser" (`@DBOS.defaultRequiredRole(["appUser"])`):
```ts
@DBOS.defaultRequiredRole(["appUser"])
@Authentication(bankAuthMiddleware)
@KoaMiddleware(koaLogger, customizeHandle, bankJwt)
export class BankEndpoints {...}
```

Some functions may need special treatment, for example, we only want to allow an admin to create a new account.
We use the `@DBOS.requiredRole()` decorator to override the defaults.
```ts
@DBOS.transaction()
@DBOS.requiredRole(["appAdmin"]) // Only an admin can create a new account.
static async createAccountFunc(ownerName: string, type: string, balance?: number) {...}
```

We can quickly review our assignment of roles to endpoints by reviewing the information DBOS presents at startup:
```
2024-06-27 14:15:23 [info]: Workflow executor initialized 
2024-06-27 14:15:23 [info]: HTTP endpoints supported: 
2024-06-27 14:15:23 [info]:     GET     :  /api/list_accounts/:ownerName 
2024-06-27 14:15:23 [info]:         Required Roles: ["appUser"] 
2024-06-27 14:15:23 [info]:     GET     :  /api/list_all_accounts 
2024-06-27 14:15:23 [info]:         Required Roles: ["appUser"] 
2024-06-27 14:15:23 [info]:     POST    :  /api/create_account 
2024-06-27 14:15:23 [info]:         Required Roles: ["appAdmin"] <-- One of these things is not like the others
2024-06-27 14:15:23 [info]:     GET     :  /api/greeting 
2024-06-27 14:15:23 [info]:         Required Roles: ["appUser"] 
2024-06-27 14:15:23 [info]:     POST    :  /api/deposit 
2024-06-27 14:15:23 [info]:         Required Roles: ["appUser"] 
2024-06-27 14:15:23 [info]:     POST    :  /api/withdraw 
2024-06-27 14:15:23 [info]:         Required Roles: ["appUser"] 
2024-06-27 14:15:23 [info]:     POST    :  /api/transfer 
2024-06-27 14:15:23 [info]:         Required Roles: ["appUser"] 
2024-06-27 14:15:23 [info]:     GET     :  /api/transaction_history/:accountId 
2024-06-27 14:15:23 [info]:         Required Roles: ["appUser"] 
```

If you are interested in learning more about declarative security in DBOS, please read our [Authentication and Authorization](https://docs.dbos.dev/typescript/tutorials/authentication-authorization) tutorial.

## Deploying to DBOS Cloud
We can make some quick changes to deploy the DBOS Bank backend in the cloud, using the free "DBOS Starter" hosting tier.

### Registration / Login
First, from the `bank-backend/` directory, execute `npx dbos-cloud register -u <username>` to register an account with DBOS cloud, or, if you are already registered execute `npx dbos-cloud login`.  This will allow you to log in securely in your browser, or create an account if you do not already have one.

### Creating Cloud Database
After logging in, create a Postgres server using `npx dbos-cloud database provision --username <pg db admin username> dbosbankdb`, changing the username and password as desired.  You will be prompted for the database password.

### Deploying DBOS Bank Backend
Deploying the first bank is straightforward:
- Register the bank app with `npx dbos-cloud app register -d dbosbankdb bank_a`.
- Deploy the app with `CURRENT_BANK=bank_a npx dbos-cloud app deploy bank_a`.
- Make a note of the `Access your application at` URL displayed, as this will be necessary for configuring the frontend.

Deploying the second bank similarly:
- Register the bank app with `npx dbos-cloud app register -d dbosbankdb bank_b`.
- Deploy the app with `CURRENT_BANK=bank_b npx dbos-cloud app deploy bank_b`.
- Make a note of the `Access your application at` URL displayed, as this will be necessary for configuring the frontend.

### Configuring and Launching Frontend

The frontend AngularJS is not hosted in DBOS Cloud; we will just continue to use the local server for the demo.

Edit the settings in `bank-frontend/src/environments/environment.ts` so that the frontend can find the bank servers.  Be sure to change both `bankHosts` and the `authUrl`, using the URLs provided from the deployment above.

After configuration, you should be able to start the frontend from the `bank-frontend` directory as before:
```bash
npm install
npm start
```

### Monitoring and Debugging

DBOS Cloud comes with a [monitoring dashboard](https://docs.dbos.dev/cloud-tutorials/monitoring-dashboard) automatically.  To find the URL for your dashboard, execute `npx dbos-cloud dashboard url`.  The dashboard includes execution traces.

## A Demo of Workflow Recovery

We can simulate a catastrophic failure during a transfer. Namely the following case:
1. we try to send a transfer from Bank A to Bank B
1. we make the transfer fail, as if bank B went offline
2. we crash Bank A before it has a chance to recover and undo the transfer

DBOS workflows are guaranteed to continue where they left off. This means that when Bank A is restarted, it will continue undoing the transfer. Shortly after restart, Bank A returns to a consistent state with the funds back in the source account.

To replicate this, perform the following:
1. in `withdrawWorkflow` (bank-backend/src/workflows/txnhistory.workflows.ts) uncomment the sleep block like so:
```ts
      if (!remoteRes) {
        // Sleep for 10 seconds before undoing the transaction
        for (let i = 0; i < 10; i++) {
          DBOS.logger.info("Sleeping")
          await DBOS.sleepms(1000)
        }

        // Undo withdrawal with a deposit.
        const undoRes = await BankTransactionHistory.updateAcctTransactionFunc(data.fromAccountId, data, true, result);
        if (undoRes !== result) {
          throw new Error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
        }
        throw new Error("Failed to deposit to remote bank; transaction reversed");
      }
```
2. Restart or redeploy Bank A with this change.
3. Stop Bank B: `CTRL+C` the app if running locally or something like `npx dbos-cloud app delete bank_b` if in the cloud.

This demo is time sensitive as you'll have a 10-second sleep window to crash Bank A. Adjust the above `sleep` loop if you nee more time. Read these steps ahead of time to get a sense for what to do:
1. Initiate a withdrawal from Bank A to Bank B
2. Because of the above `sleep` loop, you won't see the effect. You can quickly close the "Withdraw" window and refresh the browser to see that the funds left the account. Now, quickly press the red "Crash!" button.
3. If running in DBOS cloud, wait a few seconds. If you are running locally, restart Bank A by hand.
4. After restarting the app, log in again to `https://localhost:8089`. Observe the funds returning to the sender account.
5. In the log for the app, you should see the failed transfer. The 10 `Sleeping` statements, interrupted by a crash, then restart, workflow recovery and finally the "transaction reversed" error message.

## Further Reading
- To start a DBOS app from a template, visit our [quickstart](https://docs.dbos.dev/quickstart).
- For DBOS Transact programming tutorials, check out our [programming guide](https://docs.dbos.dev/typescript/programming-guide).
- To learn more about DBOS, take a look at [our documentation](https://docs.dbos.dev/) or our [source code](https://github.com/dbos-inc/dbos-transact).

DBOS [concepts](https://docs.dbos.dev/explanations/how-workflows-work) and their execution guarantees are covered in depth in the [workflow tutorial](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial).

For a quick introduction to [DBOS Cloud](https://www.dbos.dev/dbos-cloud), see [the tutorials](https://docs.dbos.dev/quickstart).  Of particular interest is the [DBOS Cloud Monitoring Dashboard](https://docs.dbos.dev/cloud-tutorials/monitoring-dashboard).

For more information on [Prisma](https://www.prisma.io) as an ORM in DBOS, see [Using Prisma](https://docs.dbos.dev/typescript/tutorials/orms/using-prisma).

If you are interested in learning more about declarative security in DBOS, please read our [Authentication and Authorization](https://docs.dbos.dev/typescript/tutorials/authentication-authorization) tutorial.
