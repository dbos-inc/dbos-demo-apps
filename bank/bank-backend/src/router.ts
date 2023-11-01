import { TransactionHistory } from "@prisma/client";
import { BankTransactionHistory } from "./workflows/txnhistory.workflows";
import { OperonResponseError, GetApi, HandlerContext, PostApi, DefaultRequiredRole, Authentication, KoaMiddleware } from "@dbos-inc/operon";
import { bankAuthMiddleware, koaLogger, bankJwt } from "./middleware";

// ts-json-schema-generator doesn't seem to handle the prisma TransactionHistory type
// so declare a simple substitute to enable OpenAPI generation
type TransactionHistoryParam = {
  txnId: bigint;
  fromAccountId: bigint;
  fromLocation: string;
  toAccountId: bigint;
  toLocation: string;
  amount: number;
  timestamp: Date;
}

@DefaultRequiredRole(["appUser"])
@Authentication(bankAuthMiddleware)
@KoaMiddleware(koaLogger, bankJwt)
export class BankEndpoints {
  // Can we have some class-wide default required roles?
  // eslint-disable-next-line @typescript-eslint/require-await
  @GetApi("/api/greeting")
  static async greeting(ctx: HandlerContext) {
    return { msg: "Hello from " + ctx.getConfig<string>("bankname") };
  }

  // Deposit.
  @PostApi("/api/deposit")
  static async deposit(ctx: HandlerContext, history: TransactionHistoryParam) {
    const data = convertTransactionHistory(history);
    if (!data.fromLocation) {
      throw new OperonResponseError("fromLocation must not be empty!", 400);
    }

    // Must to local.
    data.toLocation = "local";

    // Check the header for a specific UUID for the workflow.
    const txnUUID = ctx.koaContext.get("operon-workflowuuid");
    return ctx.invoke(BankTransactionHistory, txnUUID).depositWorkflow(data).then(x => x.getResult());
  }

  // Withdraw.
  @PostApi("/api/withdraw")
  static async withdraw(ctx: HandlerContext, history: TransactionHistoryParam) {
    const data = convertTransactionHistory(history);
    if (!data.toLocation) {
      throw new OperonResponseError("toLocation must not be empty!", 400);
    }

    // Must from local.
    data.fromLocation = "local";

    // Check the header for a specific UUID for the workflow.
    const txnUUID = ctx.koaContext.get("operon-workflowuuid");
    return ctx.invoke(BankTransactionHistory, txnUUID).withdrawWorkflow(data).then(x => x.getResult());
  }

  // Internal transfer
  @PostApi("/api/transfer")
  static async internalTransfer(ctx: HandlerContext, history: TransactionHistoryParam) {
    const data = convertTransactionHistory(history);
    // Check the transaction is within the local database.
    if ((data.fromLocation !== undefined && data.fromLocation !== "local") || (data.toLocation !== undefined && data.toLocation !== "local")) {
      throw new Error("Must be a local transaction! Instead: " + data.fromLocation + " -> " + data.toLocation);
    }

    // Check valid input.
    if (!data.toLocation || !data.toAccountId || !data.amount || !data.fromAccountId || !data.fromLocation) {
      throw new Error("Invalid input!");
    }

    return ctx.invoke(BankTransactionHistory).internalTransferFunc(data);
  }
}

// Helper functions to convert to the correct data types.
// Especially convert the bigint.
export function convertTransactionHistory(data: TransactionHistoryParam): TransactionHistory {
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
