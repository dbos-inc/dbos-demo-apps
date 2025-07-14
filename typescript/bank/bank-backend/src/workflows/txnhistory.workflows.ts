import {
  DBOS,
} from "@dbos-inc/dbos-sdk";
import { AccountInfo, PrismaClient, TransactionHistory } from "@prisma/client";
import { BankAccountInfo } from "./accountinfo.workflows";
import axios from "axios";
import { bankAuthMiddleware, bankJwt, koaLogger } from "../middleware";

const REMOTEDB_PREFIX: string = "remoteDB-";

import { dkoa, prisma } from "../resources";

@DBOS.defaultRequiredRole(["appUser"])
@dkoa.authentication(bankAuthMiddleware)
@dkoa.koaMiddleware(koaLogger, bankJwt)
export class BankTransactionHistory {
  @prisma.transaction()
  @dkoa.getApi("/api/transaction_history/:accountId")
  static async listTxnForAccountFunc(accountId: number) {
    const acctId = BigInt(accountId);
    return prisma.client.transactionHistory.findMany({
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

  static async insertTxnHistoryFunc(data: TransactionHistory) {
    return prisma.client.transactionHistory
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

  static async deleteTxnHistoryFunc(txnId: bigint) {
    return prisma.client.transactionHistory
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

  static async updateAccountBalanceFunc(acctId: bigint, balance: bigint) {
    return prisma.client.accountInfo
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

  @prisma.transaction()
  static async updateAcctTransactionFunc(acctId: bigint, data: TransactionHistory, deposit: boolean, undoTxn: bigint | null = null): Promise<bigint> {
    // First, make sure the account exists, and read the latest balance.
    const acct = await BankAccountInfo.findAccountFunc(acctId);
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

    const resId = await BankTransactionHistory.updateAccountBalanceFunc(acctId, newBalance);
    if (!resId || String(resId) !== String(acctId)) {
      throw new Error("Not enough balance!");
    }

    // Insert transaction history.
    // For some undo transactions, we need to remove that history from the table.
    let txnId;
    if (!undoTxn) {
      txnId = await BankTransactionHistory.insertTxnHistoryFunc(data);
    } else {
      txnId = await BankTransactionHistory.deleteTxnHistoryFunc(undoTxn);
    }

    return txnId;
  }

  @DBOS.step()
  static async remoteTransferComm(remoteUrl: string, data: TransactionHistory, workflowUUID: string): Promise<boolean> {
    const token = DBOS.request?.headers!["authorization"];
    if (!token) {
      DBOS.logger.error("Failed to extract valid token!");
      return false;
    }

    try {
      const remoteRes = await axios.post(remoteUrl, data, {
        headers: {
          Authorization: token,
          "dbos-workflowuuid": workflowUUID,
        },
      });
      if (remoteRes.status !== 200) {
        DBOS.logger.error("Remote transfer failed, returned with status: " + remoteRes.statusText);
        return false;
      }
    } catch (err) {
      DBOS.logger.error(err);
      return false;
    }
    return true;
  }

  @prisma.transaction()
  static async internalTransferFunc(data: TransactionHistory): Promise<string> {
    // Check if the fromAccount has enough balance.
    const fromAccount: AccountInfo | null = await BankAccountInfo.findAccountFunc(data.fromAccountId);
    if (fromAccount === null) {
      throw new Error("Cannot find account!");
    }

    if (fromAccount.balance < BigInt(data.amount)) {
      throw new Error("Not enough balance!");
    }

    // ToAccount must exist.
    const toAccount: AccountInfo | null = await BankAccountInfo.findAccountFunc(data.toAccountId);
    if (toAccount === null) {
      throw new Error("Cannot find account!");
    }

    // Update accounts and record the transaction.
    const updateRes = await BankTransactionHistory.updateAccountBalanceFunc(data.fromAccountId, fromAccount.balance - BigInt(data.amount));
    const updateRes2 = await BankTransactionHistory.updateAccountBalanceFunc(data.toAccountId, toAccount.balance + BigInt(data.amount));
    const insertRes = await BankTransactionHistory.insertTxnHistoryFunc(data);

    // Check for errors.
    if (!updateRes || !updateRes2 || !insertRes) {
      throw new Error("Failed to perform internal transfer!");
    }
    return "Internal transfer succeeded!";
  }

  @DBOS.workflow()
  static async depositWorkflow(data: TransactionHistory) {
    // Deposit locally first.
    const result = await BankTransactionHistory.updateAcctTransactionFunc(data.toAccountId, data, true);

    // Then, Contact remote DB to withdraw.
    if (data.fromLocation && !(data.fromLocation === "cash") && !data.fromLocation.startsWith(REMOTEDB_PREFIX)) {
      DBOS.logger.info("Deposit from another DB: " + data.fromLocation + ", account: " + data.fromAccountId);
      const remoteUrl = data.fromLocation + "/api/withdraw";
      const thReq = {
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amount: data.amount,
        fromLocation: "local",
        toLocation: REMOTEDB_PREFIX + process.env.BANKNAME + ":" + process.env.BANKPORT,
      };

      const remoteRes: boolean = await BankTransactionHistory.remoteTransferComm(remoteUrl, thReq as TransactionHistory, DBOS.workflowID + '-withdraw');
      if (!remoteRes) {
        // Undo transaction is a withdrawal.
        const undoRes = await BankTransactionHistory.updateAcctTransactionFunc(data.toAccountId, data, false, result);
        if (undoRes !== result) {
          DBOS.logger.error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
          throw new Error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
        }
        throw new Error("Failed to withdraw from remote bank.");
      }
    } else {
      DBOS.logger.info("Deposit from: " + data.fromLocation);
    }

    return "Deposit succeeded!";
  }

  @DBOS.workflow()
  static async withdrawWorkflow(data: TransactionHistory) {
    // Withdraw first.
    const result = await BankTransactionHistory.updateAcctTransactionFunc(data.fromAccountId, data, false);
    // Then, contact remote DB to deposit.
    if (data.toLocation && !(data.toLocation === "cash") && !data.toLocation.startsWith(REMOTEDB_PREFIX)) {
      DBOS.logger.info("Deposit to another DB: " + data.toLocation + ", account: " + data.toAccountId);
      const remoteUrl = data.toLocation + "/api/deposit";
      const thReq = {
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amount: data.amount,
        toLocation: "local",
        fromLocation: REMOTEDB_PREFIX + process.env.BANKNAME + ":" + process.env.BANKPORT,
      };
      const remoteRes: boolean = await BankTransactionHistory.remoteTransferComm(remoteUrl, thReq as TransactionHistory, DBOS.workflowID + '-deposit');
      if (!remoteRes) {
        
        ///////////////////////////////
        // Example sleep Window. For a reliability test, uncomment the below
        // Then, start a transfer to a nonexistent bank, (i.e. stop bank b).
        // Wait for app to go into sleep and then crash it. The DBOS workflow 
        // recovery will ensure the undo transaction below is executed when 
        // the app restarts
        //
        // for (let i = 0; i < 10; i++) {
        //  ctxt.logger.info("Sleeping")
        //  await ctxt.sleepms(1000)
        // }
        ///////////////////////////////
        
        // Undo withdrawal with a deposit.
        const undoRes = await BankTransactionHistory.updateAcctTransactionFunc(data.fromAccountId, data, true, result);
        if (undoRes !== result) {
          throw new Error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
        }
        throw new Error("Failed to deposit to remote bank; transaction reversed");
      }
    } else {
      DBOS.logger.info("Deposit to: " + data.fromLocation);
    }

    return "Withdraw succeeded!";
  }
}
