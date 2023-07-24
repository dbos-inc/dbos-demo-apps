import { WorkflowContext, TransactionContext, CommunicatorContext } from "operon";
import { AccountInfo, TransactionHistory } from "../sql/schema";
import { RouterResponse } from "../router";
import { bankname, bankport } from "../main";
import { findAccountFunc } from "./accountinfo.workflows";
import axios from "axios";

const REMOTEDB_PREFIX : string = "remoteDB-";

export const listTxnForAccountFunc = async (txnCtxt: TransactionContext, acctId: string | number) => {
  const { rows } = await txnCtxt.client.query<TransactionHistory>(`SELECT "txnId", "fromAccountId", "fromLocation", "toAccountId", "toLocation", "amount", "timestamp" FROM "TransactionHistory" WHERE (("fromAccountId" = $1 AND "fromLocation" = 'local') OR ("toAccountId" = $2 AND "toLocation" = 'local')) ORDER BY "timestamp" DESC;`, [acctId, acctId]);
  return rows;
};

const insertTxnHistoryFunc = async (txnCtxt: TransactionContext, data: TransactionHistory) => {
  const { rows } = await txnCtxt.client.query<TransactionHistory>(`INSERT INTO "TransactionHistory" ("fromAccountId","fromLocation","toAccountId","toLocation","amount") VALUES ($1,$2,$3,$4,$5) RETURNING "txnId"`,
    [data.fromAccountId, data.fromLocation, data.toAccountId, data.toLocation, data.amount]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0].txnId;
};

const deleteTxnHistoryFunc = async (txnCtxt: TransactionContext, txnId: number | string) => {
  const { rows } = await txnCtxt.client.query<TransactionHistory>(`DELETE FROM "TransactionHistory" WHERE "txnId" = $1 RETURNING "txnId"`,
    [txnId]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0].txnId;
};

const updateAccountBalanceFunc = async (txnCtxt: TransactionContext, acctId: string | number, balance: number | string) => {
  const { rows } = await txnCtxt.client.query<AccountInfo>(`UPDATE "AccountInfo" SET "balance" = $2 WHERE "accountId" = $1 RETURNING "accountId"`, [acctId, balance]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0].accountId;
};

const updateAcctTransactionFunc = async (txnCtxt: TransactionContext, acctId: number | string, data: TransactionHistory, deposit: boolean, undoTxn: string | number | null = null) => {
  // First, make sure the account exists, and read the latest balance.
  const acct = await findAccountFunc(txnCtxt, acctId);
  if (acct === null) {
    console.error("Cannot find account!");
    await txnCtxt.rollback();
    return null;
  }

  // Update account balance.
  let newBalance: number;
  if (deposit) {
    newBalance = Number(acct.balance) + Number(data.amount);
  } else {
    newBalance = Number(acct.balance) - Number(data.amount);
    if (newBalance < 0.0) {
      console.error("Not enough balance!");
      await txnCtxt.rollback();
      return null;
    }
  }

  const resId = await updateAccountBalanceFunc(txnCtxt, acctId, newBalance);
  if (!resId || String(resId) !== String(acctId)) {
    console.error("Failed to update account balance!");
    await txnCtxt.rollback();
    return null;
  }

  // Insert transaction history.
  // For some undo transactions, we need to remove that history from the table.
  let txnId;
  if (!undoTxn) {
    txnId = await insertTxnHistoryFunc(txnCtxt, data);
  } else {
    txnId = await deleteTxnHistoryFunc(txnCtxt, undoTxn);
  }
  
  return txnId;
};

const remoteTransferComm = async (commCtxt: CommunicatorContext, remoteUrl: string, data: TransactionHistory) => {
  try {
    const remoteRes = await axios.post(remoteUrl, data);
    if (remoteRes.status != 200) {
      console.error("Remote transfer failed, returned with status: " + remoteRes.statusText);
      return false;
    }
  } catch (err) {
    console.error(err);
    return false;
  }
  return true;
};

export const internalTransferFunc = async (txnCtxt: TransactionContext, data: TransactionHistory): Promise<RouterResponse> => {
  const retResponse: RouterResponse = {
    body: "",
    status: 200,
    message: ""
  };

  // Check if the fromAccount has enough balance.
  const fromAccount: AccountInfo | null = await findAccountFunc(txnCtxt, data.fromAccountId);
  if (fromAccount === null) {
    console.error("Cannot find account!");
    await txnCtxt.rollback();
    retResponse.status = 500;
    retResponse.message = "Cannot find fromAccount!";
    return retResponse;
  }

  if (fromAccount.balance < data.amount) {
    console.error("Not enough balance!");
    await txnCtxt.rollback();
    retResponse.status = 500;
    retResponse.message = "Not enough balance!";
    return retResponse;
  }

  // ToAccount must exist.
  const toAccount: AccountInfo | null = await findAccountFunc(txnCtxt, data.toAccountId);
  if (toAccount === null) {
    console.error("Cannot find account!");
    await txnCtxt.rollback();
    retResponse.status = 500;
    retResponse.message = "Cannot find toAccount!";
    return retResponse;
  }

  // Update accounts and record the transaction.
  const updateRes = await updateAccountBalanceFunc(txnCtxt, data.fromAccountId, Number(fromAccount.balance) - Number(data.amount));
  const updateRes2 = await updateAccountBalanceFunc(txnCtxt, data.toAccountId, Number(toAccount.balance) + Number(data.amount));
  const insertRes = await insertTxnHistoryFunc(txnCtxt, data);

  // Check for errors.
  if (!updateRes || !updateRes2 || insertRes) {
    console.error("Failed to perform internal transfer!");
    retResponse.message = "Failed to perform internal transfer!";
    retResponse.status = 500;
  } else {
    retResponse.body = "Internal transfer succeeded!";
    retResponse.status = 200;
  }

  return retResponse;
};

export const depositWorkflow = async (ctxt: WorkflowContext, data: TransactionHistory) => {
  const retResponse: RouterResponse = {
    body: "",
    status: 200,
    message: "Deposit succeeded!"
  };

  // Deposite locally first.
  const result = await ctxt.transaction(updateAcctTransactionFunc, data.toAccountId, data, true);
  if (!result) {
    retResponse.message = "Deposit failed!";
    retResponse.status = 500;
    return retResponse;
  }

  // Then, Contact remote DB to withdraw.
  if (data.fromLocation && !(data.fromLocation === 'cash') && !data.fromLocation.startsWith(REMOTEDB_PREFIX)) {
    console.log("Deposit from another DB: " + data.fromLocation + ", account: " + data.fromAccountId);
    const remoteUrl = data.fromLocation + "/api/withdraw";
    const thReq : TransactionHistory = {
      fromAccountId: data.fromAccountId,
      toAccountId: data.toAccountId,
      amount: data.amount,
      fromLocation: 'local',
      toLocation: REMOTEDB_PREFIX + bankname + ":" + bankport
    };

    const remoteRes: boolean | null = await ctxt.external(remoteTransferComm, {}, remoteUrl, thReq);
    if (!remoteRes) {
      retResponse.status = 500;
      retResponse.message = "Failed to withdraw from remote bank.";
      // Undo transaction is a withdrawal.
      const undoRes = await ctxt.transaction(updateAcctTransactionFunc, data.toAccountId, data, false, result);
      if (!undoRes || (undoRes !== result)) {
        console.error('Mismatch: Original txnId: %d, undo txnId: %d', result, undoRes);
        retResponse.message = "Serious error! Failed to recover from inconsistence state.";
      }
    }
  } else {
    console.log("Deposit from: " + data.fromLocation);
  }

  return retResponse;
};

export const withdrawWorkflow = async (ctxt: WorkflowContext, data: TransactionHistory) => {
  const retResponse: RouterResponse = {
    body: "",
    status: 200,
    message: "Withdraw succeeded!"
  };

  // Withdraw first.
  const result = await ctxt.transaction(updateAcctTransactionFunc, data.fromAccountId, data, false);
  if (!result) {
    retResponse.message = "Withdraw failed!";
    retResponse.status = 500;
    return retResponse;
  }

  // Then, contact remote DB to deposit.
  if (data.toLocation && !(data.toLocation === 'cash') && !data.toLocation.startsWith(REMOTEDB_PREFIX)) {
    console.log("Deposit to another DB: " + data.toLocation + ", account: " + data.toAccountId);
    const remoteUrl = data.toLocation + "/api/deposit";
    const thReq : TransactionHistory = {
      fromAccountId: data.fromAccountId,
      toAccountId: data.toAccountId,
      amount: data.amount,
      toLocation: 'local',
      fromLocation: REMOTEDB_PREFIX + bankname + ":" + bankport
    };
    const remoteRes: boolean | null = await ctxt.external(remoteTransferComm, {}, remoteUrl, thReq);
    if (!remoteRes) {
      retResponse.status = 500;
      retResponse.message = "Failed to deposit to remote bank.";
      // Undo transaction is a deposit.
      const undoRes = await ctxt.transaction(updateAcctTransactionFunc, data.fromAccountId, data, true, result);
      if (!undoRes || (undoRes !== result)) {
        console.error('Mismatch: Original txnId: %d, undo txnId: %d', result, undoRes);
        retResponse.message = "Serious error! Failed to recover from inconsistence state.";
      }
    }
  } else {
    console.log("Deposit to: " + data.fromLocation);
  }

  return retResponse;
};
