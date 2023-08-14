import { WorkflowContext, TransactionContext, CommunicatorContext } from "operon";
import { AccountInfo, PrismaClient, TransactionHistory } from "@prisma/client";
import { RouterResponse } from "../router";
import { bankname, bankport } from "../main";
import { findAccountFunc } from "./accountinfo.workflows";
import axios from "axios";

const REMOTEDB_PREFIX : string = "remoteDB-";

export const listTxnForAccountFunc = async (txnCtxt: TransactionContext, acctId: bigint) => {
  const p = txnCtxt.prismaClient as PrismaClient;
  return p.transactionHistory.findMany({
    where: {
      OR: [
        {
          fromAccountId:  acctId,
          fromLocation: { equals: 'local'}
        },
        {
          toAccountId: acctId,
          toLocation: { equals: 'local'}
        }
      ]
    },
    orderBy: {
      timestamp: 'desc'
    }
  });
};

const insertTxnHistoryFunc = async (txnCtxt: TransactionContext, data: TransactionHistory) => {
  const p = txnCtxt.prismaClient as PrismaClient;
  return p.transactionHistory.create({
    data: {  // Escape txnId and timestamp fields.
      fromAccountId: data.fromAccountId,
      fromLocation: data.fromLocation,
      toAccountId: data.toAccountId,
      toLocation: data.toLocation,
      amount: data.amount
    },
    select: {txnId: true}
  }).then((value) => { return value.txnId; });
};

const deleteTxnHistoryFunc = async (txnCtxt: TransactionContext, txnId: bigint) => {
  const p = txnCtxt.prismaClient as PrismaClient;
  return p.transactionHistory.delete({
    where: {
      txnId: txnId
    },
    select: { txnId: true }
  }).then((value) => { return value.txnId; });
};

const updateAccountBalanceFunc = async (txnCtxt: TransactionContext, acctId: bigint, balance: bigint) => {
  const p = txnCtxt.prismaClient as PrismaClient;
  return p.accountInfo.update({
    where: { accountId: acctId},
    data: {
      balance: balance
    },
    select: { accountId: true}
  }).then((value) => { return value.accountId; })
};

export const updateAcctTransactionFunc = async (txnCtxt: TransactionContext, acctId: bigint, data: TransactionHistory, deposit: boolean, undoTxn: bigint | null = null) => {
  // First, make sure the account exists, and read the latest balance.
  const acct = await findAccountFunc(txnCtxt, acctId);
  if (acct === null) {
    console.error("Cannot find account!");
    throw new Error("Cannot find account!");
  }

  // Update account balance.
  let newBalance: bigint;
  if (deposit) {
    newBalance = BigInt(acct.balance) + BigInt(data.amount);
  } else {
    newBalance = BigInt(acct.balance) - BigInt(data.amount);
    if (newBalance < 0n) {
      console.error("Not enough balance!");
      throw new Error("Not enough balance!");
    }
  }

  const resId = await updateAccountBalanceFunc(txnCtxt, acctId, newBalance);
  if (!resId || String(resId) !== String(acctId)) {
    console.error("Failed to update account balance!");
    throw new Error("Not enough balance!");
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

export const remoteTransferComm = async (commCtxt: CommunicatorContext, remoteUrl: string, data: TransactionHistory) => {
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
    throw new Error("Cannot find account!");
  }

  if (BigInt(fromAccount.balance) < BigInt(data.amount)) {
    console.error("Not enough balance!");
    throw new Error("Not enough balance!");
  }

  // ToAccount must exist.
  const toAccount: AccountInfo | null = await findAccountFunc(txnCtxt, data.toAccountId);
  if (toAccount === null) {
    console.error("Cannot find account!");
    throw new Error("Cannot find account!");
  }

  // Update accounts and record the transaction.
  const updateRes = await updateAccountBalanceFunc(txnCtxt, data.fromAccountId, (BigInt(fromAccount.balance) - BigInt(data.amount)));
  const updateRes2 = await updateAccountBalanceFunc(txnCtxt, data.toAccountId, (BigInt(toAccount.balance) + BigInt(data.amount)));
  const insertRes = await insertTxnHistoryFunc(txnCtxt, data);

  // Check for errors.
  if (!updateRes || !updateRes2 || !insertRes) {
    console.error("Failed to perform internal transfer!");
    throw new Error("Failed to perform internal transfer!");
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
    throw new Error("Deposit failed!");
  }

  // Then, Contact remote DB to withdraw.
  if (data.fromLocation && !(data.fromLocation === 'cash') && !data.fromLocation.startsWith(REMOTEDB_PREFIX)) {
    console.log("Deposit from another DB: " + data.fromLocation + ", account: " + data.fromAccountId);
    const remoteUrl = data.fromLocation + "/api/withdraw";
    const thReq = {
      fromAccountId: data.fromAccountId,
      toAccountId: data.toAccountId,
      amount: data.amount,
      fromLocation: 'local',
      toLocation: REMOTEDB_PREFIX + bankname + ":" + bankport
    };

    const remoteRes: boolean | null = await ctxt.external(remoteTransferComm, remoteUrl, thReq as TransactionHistory);
    if (!remoteRes) {
      // Undo transaction is a withdrawal.
      const undoRes = await ctxt.transaction(updateAcctTransactionFunc, data.toAccountId, data, false, result);
      if (!undoRes || (undoRes !== result)) {
        console.error('Mismatch: Original txnId: %d, undo txnId: %d', result, undoRes);
        throw new Error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
      }
      throw new Error("Failed to withdraw from remote bank.");
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
    throw new Error("Withdraw failed!");
  }

  // Then, contact remote DB to deposit.
  if (data.toLocation && !(data.toLocation === 'cash') && !data.toLocation.startsWith(REMOTEDB_PREFIX)) {
    console.log("Deposit to another DB: " + data.toLocation + ", account: " + data.toAccountId);
    const remoteUrl = data.toLocation + "/api/deposit";
    const thReq = {
      fromAccountId: data.fromAccountId,
      toAccountId: data.toAccountId,
      amount: data.amount,
      toLocation: 'local',
      fromLocation: REMOTEDB_PREFIX + bankname + ":" + bankport
    };
    const remoteRes: boolean | null = await ctxt.external(remoteTransferComm, remoteUrl, thReq as TransactionHistory);
    if (!remoteRes) {
      // Undo transaction is a deposit.
      const undoRes = await ctxt.transaction(updateAcctTransactionFunc, data.fromAccountId, data, true, result);
      if (!undoRes || (undoRes !== result)) {
        console.error('Mismatch: Original txnId: %d, undo txnId: %d', result, undoRes);
        throw new Error(`Mismatch: Original txnId: ${result}, undo txnId: ${undoRes}`);
      }
      throw new Error("Failed to deposit to remote bank.");
    }
  } else {
    console.log("Deposit to: " + data.fromLocation);
  }

  return retResponse;
};
