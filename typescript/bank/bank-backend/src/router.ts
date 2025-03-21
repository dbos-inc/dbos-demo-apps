import { TransactionHistory } from "@prisma/client";
import { BankTransactionHistory } from "./workflows/txnhistory.workflows";
import { DBOS, DBOSResponseError, Authentication, KoaMiddleware } from "@dbos-inc/dbos-sdk";
import { bankAuthMiddleware, koaLogger, bankJwt } from "./middleware";

@DBOS.defaultRequiredRole(["appUser"])
@Authentication(bankAuthMiddleware)
@KoaMiddleware(koaLogger, bankJwt)
export class BankEndpoints {
  // Can we have some class-wide default required roles?
  // eslint-disable-next-line @typescript-eslint/require-await
  @DBOS.getApi("/api/greeting")
  static async greeting() {
    return Promise.resolve("Hello from " + DBOS.getConfig<string>("bankname"));
  }

  // Deposit.
  @DBOS.postApi("/api/deposit")
  static async deposit() {
    const data = convertTransactionHistory(DBOS.koaContext.request.body as TransactionHistory);
    if (!data.fromLocation) {
      throw new DBOSResponseError("fromLocation must not be empty!", 400);
    }

    // Must to local.
    data.toLocation = "local";

    // Check the header for a specific UUID for the workflow.
    const txnUUID = DBOS.koaContext.get("dbos-workflowuuid");
    return await DBOS.withNextWorkflowID(txnUUID, async () => {
      return await BankTransactionHistory.depositWorkflow(data);
    });
  }

  // Withdraw.
  @DBOS.postApi("/api/withdraw")
  static async withdraw() {
    const data = convertTransactionHistory(DBOS.koaContext.request.body as TransactionHistory);
    if (!data.toLocation) {
      throw new DBOSResponseError("toLocation must not be empty!", 400);
    }

    // Must from local.
    data.fromLocation = "local";

    // Check the header for a specific UUID for the workflow.
    const txnUUID = DBOS.koaContext.get("dbos-workflowuuid");
    return await DBOS.withNextWorkflowID(txnUUID, async () => {
      return await BankTransactionHistory.withdrawWorkflow(data);
    });
  }

  // Internal transfer
  @DBOS.postApi("/api/transfer")
  static async internalTransfer() {
    const data = convertTransactionHistory(DBOS.koaContext.request.body as TransactionHistory);
    // Check the transaction is within the local database.
    if ((data.fromLocation !== undefined && data.fromLocation !== "local") || (data.toLocation !== undefined && data.toLocation !== "local")) {
      throw new Error("Must be a local transaction! Instead: " + data.fromLocation + " -> " + data.toLocation);
    }

    // Check valid input.
    if (!data.toLocation || !data.toAccountId || !data.amount || !data.fromAccountId || !data.fromLocation) {
      throw new Error("Invalid input!");
    }

    return await BankTransactionHistory.internalTransferFunc(data);
  }
}

// For demo purposes
export class CrashEndpoint {
 @DBOS.getApi('/crash_application')
  static async crashApplication() {
    // For testing and demo purposes :)
    process.exit(1);
    return Promise.resolve();
  }
}

// Helper functions to convert to the correct data types.
// Especially convert the bigint.
export function convertTransactionHistory(data: TransactionHistory): TransactionHistory {
  if (!data.amount || data.amount <= 0.0) {
    throw new DBOSResponseError("Invalid amount! " + data.amount, 400);
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
