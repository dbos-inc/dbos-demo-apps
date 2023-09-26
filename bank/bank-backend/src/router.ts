import { bankname } from "./main";
import { TransactionHistory } from "@prisma/client";
import { BankTransactionHistory } from "./workflows/txnhistory.workflows";
import { MiddlewareContext, OperonResponseError, RequiredRole, GetApi, HandlerContext, PostApi } from "@dbos-inc/operon";

// eslint-disable-next-line @typescript-eslint/require-await
export async function bankAuthMiddleware(ctx: MiddlewareContext) {
  if (ctx.requiredRole.length > 0) {
    console.log("required role: ", ctx.requiredRole);
    if (!ctx.koaContext) {
      throw new OperonResponseError("No Koa context!");
    } else if (!ctx.koaContext.state.user) {
      throw new OperonResponseError("No authenticated user!", 401);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const authenticatedUser: string = ctx.koaContext.state.user["preferred_username"] ?? "";
    console.log("current user: ", authenticatedUser);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const authenticatedRoles: string[] = ctx.koaContext.state.user["realm_access"]["roles"] ?? [];
    console.log("JWT claimed roles: ", authenticatedRoles);
    if (authenticatedRoles.includes("appAdmin")) {
      // appAdmin role has more priviledges than appUser.
      authenticatedRoles.push("appUser");
    }
    console.log("authenticated roles: ", authenticatedRoles);
    return { authenticatedUser: authenticatedUser, authenticatedRoles: authenticatedRoles };
  }
}

// Helper functions to convert to the correct data types.
// Especially convert the bigint.
function convertTransactionHistory(data: TransactionHistory): TransactionHistory {
  if (!data.amount || data.amount <= 0.0) {
    throw new OperonResponseError("Invalid amount! " + data.amount, 400);
  }
  return {
    txnId: BigInt(data.txnId ?? -1n),
    fromAccountId: BigInt(data.fromAccountId ?? -1n),
    fromLocation: data.fromLocation ?? undefined,
    toAccountId: BigInt(data.toAccountId ?? -1n),
    toLocation: data.toLocation ?? undefined,
    amount: data.amount,
    timestamp: data.timestamp ?? undefined,
  };
}

export class BankEndpoints {

  // Can we have some class-wide default required roles?
  // eslint-disable-next-line @typescript-eslint/require-await
  @GetApi("/api/greeting")
  @RequiredRole(['appUser'])
  static async greeting(ctx: HandlerContext) {
    void ctx;
    return { msg: `Hello from DBOS Operon ${bankname}!` };
  }

  // Deposit.
  @PostApi("/api/deposit")
  @RequiredRole(['appUser'])
  static async deposit(ctx: HandlerContext) {
    const data = convertTransactionHistory(ctx.koaContext.request.body as TransactionHistory);
    if (!data.fromLocation) {
      throw new OperonResponseError("fromLocation must not be empty!", 400);
    }

    // Must to local.
    data.toLocation = "local";

    // TODO: we need to find a better way to pass in parent context automatically.
    return ctx.workflow(BankTransactionHistory.depositWorkflow, {parentCtx: ctx}, data).getResult();
  }

  // Withdraw.
  @PostApi("/api/withdraw")
  @RequiredRole(['appUser'])
  static async withdraw(ctx: HandlerContext) {
    const data = convertTransactionHistory(ctx.koaContext.request.body as TransactionHistory);
    if (!data.toLocation) {
      throw new OperonResponseError("toLocation must not be empty!", 400);
    }

    // Must from local.
    data.fromLocation = "local";

    return ctx.workflow(BankTransactionHistory.withdrawWorkflow, {parentCtx: ctx}, data).getResult();
  }

  // Internal transfer
  @PostApi("/api/transfer")
  @RequiredRole(['appUser'])
  static async internalTransfer(ctx: HandlerContext) {
    const data = convertTransactionHistory(ctx.koaContext.request.body as TransactionHistory);
    // Check the transaction is within the local database.
    if ((data.fromLocation !== undefined && data.fromLocation !== "local") || (data.toLocation !== undefined && data.toLocation !== "local")) {
      throw new Error("Must be a local transaction! Instead: " + data.fromLocation + " -> " + data.toLocation);
    }

    // Check valid input.
    if (!data.toLocation || !data.toAccountId || !data.amount || !data.fromAccountId || !data.fromLocation) {
      throw new Error("Invalid input!");
    }

    return ctx.transaction(BankTransactionHistory.internalTransferFunc, {parentCtx: ctx}, data);
  }
}
