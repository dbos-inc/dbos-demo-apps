import {
  WorkflowContext,
  TransactionContext,
  CommunicatorContext,
  Transaction,
  Communicator,
  Workflow,
  GetApi,
  DefaultRequiredRole,
  Authentication,
  KoaMiddleware,
  ArgOptional,
  ArgSource,
  ArgSources,
} from "@dbos-inc/dbos-sdk";
import { AccountInfo, PrismaClient, TransactionHistory } from "@prisma/client";
import { BankAccountInfo } from "./accountinfo.workflows";
import axios from "axios";
import { bankAuthMiddleware, bankJwt, koaLogger } from "../middleware";

const REMOTEDB_PREFIX: string = "remoteDB-";
type PrismaContext = TransactionContext<PrismaClient>;

@DefaultRequiredRole(["appUser"])
@Authentication(bankAuthMiddleware)
@KoaMiddleware(koaLogger, bankJwt)
export class BankTransactionHistory {
  @Transaction()
  @GetApi("/api/transaction_history/:accountId")
  static async listTxnForAccountFunc(txnCtxt: PrismaContext, @ArgSource(ArgSources.URL) accountId: number) {
    const acctId = BigInt(accountId);
    return txnCtxt.client.transactionHistory.findMany({
      where: {
        OR: [
          {
            fromAccountId: acctId,
            fromLocation: { equals: "local" },
          },
          {
            toAccountId: acctId,
            toLocation: { equals: "local" },
          },
        ],
      },
      orderBy: {
        timestamp: "desc",
      },
    });
  }

  @Transaction()
  static async insertTxnHistoryFunc(txnCtxt: PrismaContext, data: TransactionHistory) {
    return txnCtxt.client.transactionHistory
      .create({
        data: {
          // Escape txnId and timestamp fields.
          fromAccountId: data.fromAccountId,
          fromLocation: data.fromLocation,
          toAccountId: data.toAccountId,
          toLocation: data.toLocation,
          amount: data.amount,
        },
        select: { txnId: true },
      })
      .then((value) => {
        return value.txnId;
      });
  }

  @Transaction()
  static async deleteTxnHistoryFunc(txnCtxt: PrismaContext, txnId: bigint) {
    return txnCtxt.client.transactionHistory
      .delete({
        where: {
          txnId: txnId,
        },
        select: { txnId: true },
      })
      .then((value) => {
        return value.txnId;
      });
  }

  @Transaction()
  static async updateAccountBalanceFunc(txnCtxt: PrismaContext, acctId: bigint, balance: bigint) {
    return txnCtxt.client.accountInfo
      .update({
        where: { accountId: acctId },
        data: {
          balance: balance,
        },
        select: { accountId: true },
      })
      .then((value) => {
        return value.accountId;
      });
  }

  @Transaction()
  static async updateAcctTransactionFunc(txnCtxt: PrismaContext, acctId: bigint, data: TransactionHistory, deposit: boolean, @ArgOptional undoTxn: bigint | null = null): Promise<bigint> {
    // First, make sure the account exists, and read the latest balance.
    const acct = await BankAccountInfo.findAccountFunc(txnCtxt, acctId);
    if (acct === null) {
      throw new Error("Cannot find account!");
    }

    // Update account balance.
    let newBalance: bigint;
    if (deposit) {
      newBalance = acct.balance + BigInt(data.amount);
    } else {
      newBalance = acct.balance - BigInt(data.amount);
      if (newBalance < 0n) {
        throw new Error("Not enough balance!");
      }
    }

    const resId = await BankTransactionHistory.updateAccountBalanceFunc(txnCtxt, acctId, newBalance);
    if (!resId || String(resId) !== String(acctId)) {
      throw new Error("Not enough balance!");
    }

    // Insert transaction history.
    // For some undo transactions, we need to remove that history from the table.
    let txnId;
    if (!undoTxn) {
      txnId = await BankTransactionHistory.insertTxnHistoryFunc(txnCtxt, data);
    } else {
      txnId = await BankTransactionHistory.deleteTxnHistoryFunc(txnCtxt, undoTxn);
    }

    return txnId;
  }

  @Communicator()
  static async remoteTransferComm(commCtxt: CommunicatorContext, remoteUrl: string, data: TransactionHistory, workflowUUID: string): Promise<boolean> {
    const token = commCtxt.request?.headers!["authorization"];
    if (!token) {
      commCtxt.logger.error("Failed to extract valid token!");
      return false;
    }

    try {
      const remoteRes = await axios.post(remoteUrl, data, {
        headers: {
          Authorization: token,
          "operon-workflowuuid": workflowUUID,
        },
      });
      if (remoteRes.status != 200) {
        commCtxt.logger.error("Remote transfer failed, returned with status: " + remoteRes.statusText);
        return false;
      }
    } catch (err) {
      commCtxt.logger.error(err);
      return false;
    }
    return true;
  }

  @Transaction()
  static async internalTransferFunc(txnCtxt: PrismaContext, data: TransactionHistory): Promise<string> {
    // Check if the fromAccount has enough balance.
    const fromAccount: AccountInfo | null = await BankAccountInfo.findAccountFunc(txnCtxt, data.fromAccountId);
    if (fromAccount === null) {
      throw new Error("Cannot find account!");
    }

    if (fromAccount.balance < BigInt(data.amount)) {
      throw new Error("Not enough balance!");
    }

    // ToAccount must exist.
    const toAccount: AccountInfo | null = await BankAccountInfo.findAccountFunc(txnCtxt, data.toAccountId);
    if (toAccount === null) {
      throw new Error("Cannot find account!");
    }

    // Update accounts and record the transaction.
    const updateRes = await BankTransactionHistory.updateAccountBalanceFunc(txnCtxt, data.fromAccountId, fromAccount.balance - BigInt(data.amount));
    const updateRes2 = await BankTransactionHistory.updateAccountBalanceFunc(txnCtxt, data.toAccountId, toAccount.balance + BigInt(data.amount));
    const insertRes = await BankTransactionHistory.insertTxnHistoryFunc(txnCtxt, data);

    // Check for errors.
    if (!updateRes || !updateRes2 || !insertRes) {
      throw new Error("Failed to perform internal transfer!");
    }
    return "Internal transfer succeeded!";
  }

  @Workflow()
  static async depositWorkflow(ctxt: WorkflowContext, data: TransactionHistory) {
    // Deposite locally first.
    const result = await ctxt.invoke(BankTransactionHistory).updateAcctTransactionFunc(data.toAccountId, data, true);

    // Then, Contact remote DB to withdraw.
    if (data.fromLocation && !(data.fromLocation === "cash") && !data.fromLocation.startsWith(REMOTEDB_PREFIX)) {
      ctxt.logger.info("Deposit from another DB: " + data.fromLocation + ", account: " + data.fromAccountId);
      const remoteUrl = data.fromLocation + "/api/withdraw";
      const thReq = {
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amount: data.amount,
        fromLocation: "local",
        toLocation: REMOTEDB_PREFIX + ctxt.getConfig<string>("bankname") + ":" + ctxt.getConfig<string>("bankport"),
      };

      const remoteRes: boolean = await ctxt.invoke(BankTransactionHistory).remoteTransferComm(remoteUrl, thReq as TransactionHistory, ctxt.workflowUUID + '-withdraw');
      if (!remoteRes) {
        // Undo transaction is a withdrawal.
        const undoRes = await ctxt.invoke(BankTransactionHistory).updateAcctTransactionFunc(data.toAccountId, data, false, result);
        if (undoRes !== result) {
          ctxt.logger.error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
          throw new Error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
        }
        throw new Error("Failed to withdraw from remote bank.");
      }
    } else {
      ctxt.logger.info("Deposit from: " + data.fromLocation);
    }

    return "Deposit succeeded!";
  }

  @Workflow()
  static async withdrawWorkflow(ctxt: WorkflowContext, data: TransactionHistory) {
    // Withdraw first.
    const result = await ctxt.invoke(BankTransactionHistory).updateAcctTransactionFunc(data.fromAccountId, data, false);

    // Then, contact remote DB to deposit.
    if (data.toLocation && !(data.toLocation === "cash") && !data.toLocation.startsWith(REMOTEDB_PREFIX)) {
      ctxt.logger.info("Deposit to another DB: " + data.toLocation + ", account: " + data.toAccountId);
      const remoteUrl = data.toLocation + "/api/deposit";
      const thReq = {
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amount: data.amount,
        toLocation: "local",
        fromLocation: REMOTEDB_PREFIX + ctxt.getConfig<string>("bankname") + ":" + ctxt.getConfig<string>("bankport"),
      };
      const remoteRes: boolean = await ctxt.invoke(BankTransactionHistory).remoteTransferComm(remoteUrl, thReq as TransactionHistory, ctxt.workflowUUID + '-deposit');
      if (!remoteRes) {
        // Undo transaction is a deposit.
        const undoRes = await ctxt.invoke(BankTransactionHistory).updateAcctTransactionFunc(data.fromAccountId, data, true, result);
        if (undoRes !== result) {
          throw new Error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
        }
        throw new Error("Failed to deposit to remote bank.");
      }
    } else {
      ctxt.logger.info("Deposit to: " + data.fromLocation);
    }

    return "Withdraw succeeded!";
  }
}
