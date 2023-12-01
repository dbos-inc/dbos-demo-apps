# Operon Bank Demo App

This is a simplified bank application that uses [Operon](https://github.com/dbos-inc/dbos-sdk) as the backend framework.
It requires Node 18.x or later and Docker.

## Run the Demo

### Pre-requisites

#### Start PostgreSQL
First, let's set up a Postgres database.
Set the `PGPASSWORD` environment variable to whatever you'd like, then start Postgres in a Docker container using our convenient script:
```shell
export PGPASSWORD=<database password>
./scripts/start_postgres_docker.sh
```
This script sets up a new Postgres user `bank` that owns the database `bank`, and creates a `keycloak` schema in the `bank` database so we can proceed to our next step.

#### Start Keycloak
Next, start a [Keycloak](https://www.keycloak.org/) server using Docker.
We use Keycloak to manage user authentication for our bank application.
```shell
./scripts/start_keycloak_docker.sh
```
You can visit `http://localhost:8083/` to view the admin console for the Keyclock server.
We import a default [dbos-realm](./scripts/dbos-realm.json) with the admin name and password (you can use it to log in Keycloak's admin console):
```
dbos-admin / dbos-pass
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

npx operon start -p 8081
```

Then, in a second terminal window, launch the second bank server, using an identical but differently-named schema:

```bash
export PGPASSWORD=<database password>
export BANK_SCHEMA=bank2

# Create tables under the bank2 schema.
npx prisma migrate dev --name initbank2

npx operon start -p 8082
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
The drop-down menu at the top allows you to switch between two bank servers (bank1 at port 8081 and bank2 at port 8082) we just started.
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
We use [Jaeger Tracing](https://www.jaegertracing.io/) to visualize traces of Operon operations. We provide a script to automatically start it in a docker container:
```bash
./scripts/start_jaeger_docker.sh
```
Once it starts, you will see traces via the Jaeger UI: http://localhost:16686/

## Under the Covers

> Note, this section assumes you have read at least the [Operon Getting Started docs](https://docs.dbos.dev/category/getting-started).

The goal of this Bank demo is to highlight two major Operon features:

1. Reliable orchestration of complex workflows involving multiple database transactions.
2. Declarative authentication and authorization through Operon middleware and decorators.

The following sections walk you through the code for each feature, along with detailed notes regarding how it works.

### Reliable Cross-Bank Transactions -- `depositWorkflow`

We use our [deposit workflow](./bank-backend/src/workflows/txnhistory.workflows.ts#L190) to show how Operon can reliably orchestrate a complex business-critical operation like a bank transfer.
This workflow performs three steps:

1. Record the deposit transaction locally.
2. If the deposit comes from a remote bank, contact that bank to withdraw the same amount of money.
3. If the remote operation succeeds, complete the workflow, otherwise undo the local deposit transaction. 

We obviously need to execute these steps reliably, otherwise a deposit could succeed without a corresponding withdrawal.
Operon makes this easier by guaranteeing all workflows run to completion.
Here's the signature for our reliable workflow:

```ts
@Workflow()
static async depositWorkflow(ctxt: WorkflowContext, data: TransactionHistory) {...}
```

Like other Operon operations, `depositWorkflow` is a static method on a class, in this case named `BankTransactionHistory`, and is decorated with `@Workflow()` and has a `WorkflowContext` as the first parameter.
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

Note that we pass in `"ctxt.workflowUUID + '-withdraw'"` as the identity UUID for the remote workflow. The communicator function sets an HTTP header "operon-workflowuuid" with this UUID, so Operon can guarantee that the remote workflow runs exactly once even if the communicator is retried.

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

Operon guarantees that this workflow runs to completion and every operation executes exactly once (please see our [idempotency](https://docs.dbos.dev/tutorials/idempotency-tutorial) tutorial for more details), which is crucial for business-critical transactions such as the ones in banking applications.


### Authentication and Authorization

In Bank, users authenticate with the frontend via an external Keycloak service, and then authenticate with the backend via JWT tokens.
Authentication and authorization in the backend proceeds in three steps:
1. Verify the JWT token with Keycloak using a Koa middleware.
2. Use an Operon authentication middleware to extract user and role information set by the Koa middleware in step 1.
3. Operon checks the authenticated user and roles against the required roles of the target operation.

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
If the token is valid, the `bankJwt` middleware sets a `state.user` object in the Koa context, which can be used by later middleware -- in our case, the Operon authentication middleware.


In the second step, we write a custom authentication middleware to extract authenticated user and role information set by the Koa middleware:
```ts
export async function bankAuthMiddleware(ctx: MiddlewareContext) {
  // Only extract user and roles if the operation specifies required roles.
  if (ctx.requiredRole.length > 0) {
    if (!ctx.koaContext.state.user) {
      throw new OperonResponseError("No authenticated user!", 401);
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

Finally, we declare required roles for our classes and functions, and Operon compares the currently authenticated user and roles against the required ones to authorize a request.
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

If you are interested in learning more about declarative security in Operon, please read our [Authentication and Authorization](https://docs.dbos.dev/tutorials/authentication-authorization) tutorial.