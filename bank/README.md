# DBOS Bank Demo App

DBOS Bank Demo App is a simplified bank application that uses [DBOS Transact](https://github.com/dbos-inc/dbos-sdk) as the backend framework.

This demo shows simple database operations using [Prisma](https://www.prisma.io), integration with an [Angular](https://angularjs.org/) front end, and highlights use of workflows to keep two databases (owned by different entities) in sync without distributed transactions.

The demo requires Node 20.x or later and uses Docker to simplify setup.

## Demo Overview

### Application Components
TODO: The DBOS Bank Demo App presents simplified ...

### Introduction To Bank Transfer Operations
The transfer of funds between banks has never relied on [distributed transactions](https://en.wikipedia.org/wiki/Distributed_transaction) in the academic sense.
Nor is it possible to use mechanisms such as [two-phase-commit](https://en.wikipedia.org/wiki/Two-phase_commit_protocol) to implement the behavior of the banking system, which accomodates paper checks, fraud protections, and so on.

Accurate, reliable interbank transfers [predate widespread electronic systems by over a century](https://cacm.acm.org/opinion/victorian-data-processing/).
Many features (such as the ability to write checks on paper) along with associated artifacts (bad checks, disputed charges, and processes to deal with them) remain in modern banking.
So, banking remains a system of requests, settlements/reconciliation, and compensating actions, rather than a system of near-instant ACID transactions.

### DBOS Bank Transfer Model

Many interbank transactions rely on a third-party [clearing house](https://en.wikipedia.org/wiki/Automated_clearing_house).
However, this DBOS Bank Demo App acts more like a [wire transfer](https://en.wikipedia.org/wiki/Wire_transfer), where banks send messages to each other directly.

Of course the demo is simplified: it does not use [SWIFT](https://en.wikipedia.org/wiki/SWIFT) or a similar standard network for messaging, nor is the settlement process (wherein the sending bank transfers some real assets to the receiving bank) implemented.

The demo does, however:

* Verify the identity of the sender
* Verify that the sender has funds available to send
* Put a hold on funds during the course of transfer
* Send the transfer request to another bank server
* Credit the recipients account and deduct from the sender's account

The DBOS Bank Demo App ensures that either both accounts are affected, or neither is, regardless of any functional or non-functional errors.  This is done with very little error-handling code, and the error-handling code that exists is in support of business requirements (sender must actually have the money) rather than for handling hardware or environmental issues.

## Run the Demo Locally

### Start PostgreSQL

First, let's set up a database for each bank.  Each bank app can have its own database server, but, to simplify deployment, we will put both bank databases in the same Postgres instance.

The demo provides two ways to set up Postgres:
* A script set up a Docker container with Postgres configured.  If you have an existing p

#### Using Docker for Postgres

Set the `PGPASSWORD` environment variable to whatever you'd like, then start Postgres in a Docker container using the `start_postgres_docker` script:
```shell
export PGPORT=5432 # Optional; can be set to a non-default value
export PGPASSWORD=<database password>
./scripts/start_postgres_docker.sh
```
This script sets up two new Postgres users: `bank_a` that owns the database `bank_a`, and `bank_b` that owns database `bank_b`.

#### Use an Existing Postgres
```sql
CREATE USER bank_a PASSWORD 'postgres'; -- Feel free to change the passwords
ALTER USER bank_a CREATEDB;
CREATE DATABASE bank_a OWNER bank_a;
CREATE USER bank_b PASSWORD 'postgres';
ALTER USER bank_b CREATEDB;
CREATE DATABASE bank_b OWNER bank_b;
```

### Start two backend servers
In this tutorial, we'll start two bank servers, respresenting two different banks, and do transactions across them.
First, build the bank application.  In the `bank-backend/` directory, run:

```shell
npm install
npm run build
```

Next, use [Prisma](https://www.prisma.io/) to create a schema for the first bank server then launch it:

```bash
export PGPASSWORD=<database password>
export BANK_SCHEMA=bank1

# Create tables under the bank1 schema.
npx prisma migrate dev --name initbank1

npx dbos-sdk start -p 8081
```

Then, in a second terminal window, launch the second bank server, using an identical but differently-named schema:

```bash
export PGPASSWORD=<database password>
export BANK_SCHEMA=bank2

# Create tables under the bank2 schema.
npx prisma migrate dev --name initbank2

npx dbos-sdk start -p 8083
```

### Start the frontend

To start the frontend, enter the `bank-frontend/` directory and run:
```bash
npm install
npm start

# You should see this:
** Angular Live Development Server is listening on localhost:8089, open your browser on http://localhost:8089/ **
```

## Demo Walkthrough

Once you finish all previous steps, navigate to http://localhost:8089/
You will be presented with a welcome page.
Press the `Login` button and the webpage should redirect to a login page from Keycloak.

You can use the following email and password to log in:
```
mike@other.com / pass
```

Once you successfully log in, the frontend should re-direct you to the home page of the bank user.
The drop-down menu at the top allows you to switch between two bank servers (bank1 at port 8081 and bank2 at port 8083) we just started.
There are three buttons in the middle:
- "New Greeting Message" fetches a greeting message from the backend and displays it in the "Message from Bank" banner above.
- "Create a New Account" creates a new checking account for the current user. 
- "Refresh Accounts" refreshes the list of accounts of the current user.

Now, once you click "Create a New Account" several times in both bank1 and bank2, you will see a list of accounts displayed with their `Account ID`, `Balance`, `Type`, and `Actions`. Initially, all accounts have zero balance.
Select the "Choose an Action" drop-down menu next to each account, you will see several options:
- "Transaction History" displays a list of past transactions from latest to oldest.
- "Deposit" allows you to deposit either from cash or an account in another bank backend.
- "Withdraw" allows you to withdraw either to cash or an account in another bank backend.
- "Internal Transfer" allows you to transfer between your own accounts within the same bank backend.

Sometimes the JWT token would expire and cause failures. You can refresh the page and try again. Refreshing the webpage obtains a new token.

### (Optional) Visualize Tracing
We use [Jaeger Tracing](https://www.jaegertracing.io/) to visualize traces of DBOS operations. We provide a script to automatically start it in a docker container:
```bash
./scripts/start_jaeger_docker.sh
```
Once it starts, you will see traces via the Jaeger UI: http://localhost:16686/

## Under the Covers

> Note, this section assumes you have read at least the [DBOS Getting Started docs](https://docs.dbos.dev/category/getting-started).

The goal of this Bank demo is to highlight two major DBOS features:

1. Reliable orchestration of complex workflows involving multiple database transactions.
2. Declarative authentication and authorization through DBOS middleware and decorators.

The following sections walk you through the code for each feature, along with detailed notes regarding how it works.

### Reliable Cross-Bank Transactions -- `depositWorkflow`

We use our [deposit workflow](./bank-backend/src/workflows/txnhistory.workflows.ts#L190) to show how DBOS can reliably orchestrate a complex business-critical operation like a bank transfer.
This workflow performs three steps:

1. Record the deposit transaction locally.
2. If the deposit comes from a remote bank, contact that bank to withdraw the same amount of money.
3. If the remote operation succeeds, complete the workflow, otherwise undo the local deposit transaction. 

We obviously need to execute these steps reliably, otherwise a deposit could succeed without a corresponding withdrawal.
DBOS makes this easier by guaranteeing all workflows run to completion.
Here's the signature for our reliable workflow:

```ts
@Workflow()
static async depositWorkflow(ctxt: WorkflowContext, data: TransactionHistory) {...}
```

Like other DBOS operations, `depositWorkflow` is a static method on a class, in this case named `BankTransactionHistory`, and is decorated with `@Workflow()` and has a `WorkflowContext` as the first parameter.
The second argument has a `TransactionHistory` type, which is automatically generated by the [PrismaClient](https://www.prisma.io/docs/concepts/components/prisma-client).

In the first step, the workflow performs a deposit transaction to a local account.
We implement it in a [`updateAcctTransactionFunc`](./bank-backend/src/workflows/txnhistory.workflows.ts#L98) function which updates the user balance and appends an entry to the transaction history.
The workflow invokes this function and specifies it is a deposit:
```ts
// Deposit locally first.
const result = await ctxt.invoke(BankTransactionHistory)
  .updateAcctTransactionFunc(
    data.toAccountId,
    data,
    /*isDeposit=*/ true
  );
```

If the deposit transaction fails, it throws an exception and rolls back automatically, additionally failing the workflow.
If the deposit transaction succeeds, it returns a bank transaction ID, which can be used later to undo this transaction.

In the second step, the workflow invokes a communicator function that sends an HTTP request to the remote backend server to invoke a `withdrawWorkflow` which withdraws the same amount of money from the remote account:
```ts
const remoteUrl = data.fromLocation + "/api/withdraw";
const thReq = {
  fromAccountId: data.fromAccountId,
  toAccountId: data.toAccountId,
  amount: data.amount,
  fromLocation: "local",
  toLocation: REMOTEDB_PREFIX + ctxt.getConfig<string>("bankname") + ":" + ctxt.getConfig<string>("bankport"),
};

const remoteRes: boolean = await ctxt.invoke(BankTransactionHistory)
  .remoteTransferComm(
    remoteUrl,
    thReq as TransactionHistory,
    /*workflowUUID=*/ ctxt.workflowUUID + '-withdraw'
  );
```

Note that we pass in `"ctxt.workflowUUID + '-withdraw'"` as the identity UUID for the remote workflow. The communicator function sets an HTTP header "dbos-workflowuuid" with this UUID, so DBOS can guarantee that the remote workflow runs exactly once even if the communicator is retried.

Finally, if the communicator returns `false` or fails, it means the remote withdrawal failed and we must undo the previous deposit transaction.
This undo transaction subtracts the user balance and removes the entry from the bank transaction history (we added it in the first step).
```ts
if (!remoteRes) {
  // Undo transaction is a withdrawal.
  const undoRes = await ctxt.invoke(BankTransactionHistory)
    .updateAcctTransactionFunc(
      data.toAccountId,
      data,
      /*isDeposit=*/ false,
      /*undoTxnId=*/ result
    );
}
```

DBOS guarantees that this workflow runs to completion and every operation executes exactly once (please see our [idempotency](https://docs.dbos.dev/tutorials/idempotency-tutorial) tutorial for more details), which is crucial for business-critical transactions such as the ones in banking applications.


### Authentication and Authorization

In Bank, users authenticate with the frontend via an external Keycloak service, and then authenticate with the backend via JWT tokens.
Authentication and authorization in the backend proceeds in three steps:
1. Verify the JWT token with Keycloak using a Koa middleware.
2. Use an authentication middleware to extract user and role information set by the Koa middleware in step 1.
3. The framework checks the authenticated user and roles against the required roles of the target operation.

First, the bank backend uses the [`koa-jwt`](https://github.com/koajs/jwt) middleware for JWT verification:
```ts
import jwt from "koa-jwt";

export const bankJwt = jwt({
  secret: koaJwtSecret({
    jwksUri: `http://${process.env.BANK_HOST || "localhost"}:${process.env.AUTH_PORT || "8083"}/realms/dbos/protocol/openid-connect/certs`,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 600000,
  }),
  issuer: `http://${process.env.BANK_HOST || "localhost"}:${process.env.AUTH_PORT || "8083"}/realms/dbos`,
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
All classes are decorated with a default required role "appUser" (`@DefaultRequiredRole(["appUser"])`):
```ts
@DefaultRequiredRole(["appUser"])
@Authentication(bankAuthMiddleware)
@KoaMiddleware(koaLogger, customizeHandle, bankJwt)
export class BankEndpoints {...}
```

Some functions may need special treatment, for example, we only want to allow an admin to create a new account.
We use the `@RequiredRole()` decorator to override the defaults.
```ts
@Transaction()
@PostApi("/api/create_account")
@RequiredRole(["appAdmin"]) // Only an admin can create a new account.
static async createAccountFunc(txnCtxt: PrismaContext, ownerName: string, type: string, @ArgOptional balance?: number) {...}
```

For example, we configure another test user, email and password `john@test.com / 123`, to only have an "appUser" role and is not authorized to create a new account.
If you logged in as `john@test.com`, pressing the "Create a New Account" button would fail.

If you are interested in learning more about declarative security in DBOS, please read our [Authentication and Authorization](https://docs.dbos.dev/tutorials/authentication-authorization) tutorial.

### Deploying to DBOS Cloud

### Further Reading
If you are interested in learning more about declarative security in DBOS, please read our [Authentication and Authorization](https://docs.dbos.dev/tutorials/authentication-authorization) tutorial.
