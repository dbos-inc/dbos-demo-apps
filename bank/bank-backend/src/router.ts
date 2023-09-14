import { bankname, operon } from "./main";
import { BankAccountInfo } from "./workflows/accountinfo.workflows";
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
    timestamp: data.timestamp ?? undefined
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class BankEndpoints {

  static load() {
    console.log("Load endpoints!");
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  @GetApi("/api/greeting")
  static async greeting(ctx: HandlerContext) {
    void ctx;
    return { msg: `Hello from DBOS Operon ${bankname}!` };
  }

  // List accounts.
  @GetApi("/api/list_accounts/:ownerName")
  static async listAccounts(ctx: HandlerContext, ownerName: string) {
    return operon.transaction(BankAccountInfo.listAccountsFunc, {}, ownerName);
  }

  // Create account.
  @PostApi("/api/create_account")
  static async createAccount(ctx: HandlerContext, ownerName: string, type: string, balance: number) {
    const data = {
      accountId: -1n,
      ownerName: ownerName,
      balance: BigInt(balance ?? 0),
      type: type
    };

    return operon.transaction(BankAccountInfo.createAccountFunc, {}, data);
  }

  // Get transaction history
  @GetApi("/api/transaction_history/:accountId")
  static async getTxnHistory (ctx: HandlerContext, accountId: number) {
    const acctId = BigInt(accountId);
    return operon.transaction(BankTransactionHistory.listTxnForAccountFunc, {}, acctId);
  }


  // Deposit.
  @PostApi("/api/deposit")
  static async deposit (ctx: HandlerContext) {
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
    data.toLocation = 'local';

    // Let it be -1 for cash.
    if (!data.fromAccountId) {
      data.fromAccountId = -1n;
    }
    
    // Invoke the workflow.
    return operon.workflow(BankTransactionHistory.depositWorkflow, {}, data).getResult();
  }

  // Withdraw.
  @PostApi("/api/withdraw")
  static async withdraw (ctx: HandlerContext) {
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
    data.fromLocation = 'local';

    // Let it be -1 for cash.
    if (!data.toAccountId) {
      data.toAccountId = -1n;
    }
  
    // Invoke the workflow.
    return operon.workflow(BankTransactionHistory.withdrawWorkflow, {}, data).getResult();
  }

  // Internal transfer
  @PostApi("/api/transfer")
  static async internalTransfer(ctx: HandlerContext) {
    const data = convertTransactionHistory(ctx.koaContext.request.body as TransactionHistory);
    // Check the transaction is within the local database.
    if (((data.fromLocation !== undefined) && (data.fromLocation !== 'local'))
      || ((data.toLocation !== undefined) && (data.toLocation !== 'local'))) {
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
    return operon.transaction(BankTransactionHistory.internalTransferFunc, {}, data);
  }
}
