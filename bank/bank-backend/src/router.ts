import { bankname } from "./main";
import { TransactionHistory } from "@prisma/client";
import { BankTransactionHistory } from "./workflows/txnhistory.workflows";
import { GetApi, HandlerContext, PostApi } from "operon/dist/src/httpServer/handler";

// Helper functions to convert to the correct data types.
// Especially convert the bigint.
function convertTransactionHistory(data: TransactionHistory): TransactionHistory {
  return {
    txnId: BigInt(data.txnId ?? -1n),
    fromAccountId: BigInt(data.fromAccountId ?? -1n),
    fromLocation: data.fromLocation ?? undefined,
    toAccountId: BigInt(data.toAccountId ?? -1n),
    toLocation: data.toLocation ?? undefined,
    amount: data.amount ?? undefined,
    timestamp: data.timestamp ?? undefined,
  };
}

export class BankEndpoints {
  // eslint-disable-next-line @typescript-eslint/require-await
  @GetApi("/api/greeting")
  static async greeting(ctx: HandlerContext) {
    void ctx;
    return { msg: `Hello from DBOS Operon ${bankname}!` };
  }

  // Deposit.
  @PostApi("/api/deposit")
  static async deposit(ctx: HandlerContext) {
    const data = convertTransactionHistory(ctx.koaContext.request.body as TransactionHistory);
    // TODO: implement auth.
    // const token = ctx.request.header["authorization"];
    if (!data.fromLocation) {
      throw new Error("fromLocation must not be empty!");
    }

    if (!data.amount || data.amount <= 0) {
      throw new Error("Invalid amount! " + data.amount);
    }

    // Must to local.
    data.toLocation = "local";

    // Let it be -1 for cash.
    if (!data.fromAccountId) {
      data.fromAccountId = -1n;
    }

    // Invoke the workflow.
    // TODO: we need to find a better way to pass in parent context automatically.
    return ctx.operon.workflow(BankTransactionHistory.depositWorkflow, {parentCtx: ctx}, data).getResult();
  }

  // Withdraw.
  @PostApi("/api/withdraw")
  static async withdraw(ctx: HandlerContext) {
    const data = convertTransactionHistory(ctx.koaContext.request.body as TransactionHistory);
    // TODO: implement auth.
    // const token = ctx.request.header["authorization"];
    // console.log("Retrieved token: " + token); // Should have Bearer prefix.
    if (!data.toLocation) {
      throw new Error("toLocation must not be empty!");
    }

    if (!data.amount || data.amount <= 0) {
      throw new Error("Invalid amount! " + data.amount);
    }

    // Must from local.
    data.fromLocation = "local";

    // Let it be -1 for cash.
    if (!data.toAccountId) {
      data.toAccountId = -1n;
    }

    // Invoke the workflow.
    return ctx.operon.workflow(BankTransactionHistory.withdrawWorkflow, {parentCtx: ctx}, data).getResult();
  }

  // Internal transfer
  @PostApi("/api/transfer")
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

    if (data.amount <= 0.0) {
      throw new Error("Invalid amount!");
    }

    // Invoke the transaction.
    return ctx.operon.transaction(BankTransactionHistory.internalTransferFunc, {parentCtx: ctx}, data);
  }
}
