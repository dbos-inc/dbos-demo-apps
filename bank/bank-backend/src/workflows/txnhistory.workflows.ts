import { WorkflowContext, TransactionContext } from "operon";
import { AccountInfo, TransactionHistory } from "../sql/schema";
import { RouterResponse } from "../router";
import { bankname, bankport } from "../main";

const REMOTEDB_PREFIX : string = "remoteDB-";

export const listTxnForAccountFunc = async (txnCtxt: TransactionContext, acctId: string | number) => {
  const { rows } = await txnCtxt.client.query<TransactionHistory>(`SELECT "txnId", "fromAccountId", "fromLocation", "toAccountId", "toLocation", "amount", "timestamp" FROM "TransactionHistory" WHERE (("fromAccountId" = $1 AND "fromLocation" = 'local') OR ("toAccountId" = $2 AND "toLocation" = 'local')) ORDER BY "timestamp" DESC;`, [acctId, acctId]);
  console.log(rows);
  return rows;
};


const findAccountFunc = async (txnCtxt: TransactionContext, acctId: string | number) => {
  const { rows } = await txnCtxt.client.query<AccountInfo>(`SELECT "accountId", "ownerName", "type", "balance" FROM "AccountInfo" WHERE "accountId" = $1`, [acctId]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0];
};

const insertTxnHistoryFunc = async (txnCtxt: TransactionContext, data: TransactionHistory) => {
  await txnCtxt.client.query<TransactionHistory>(`INSERT INTO "TransactionHistory" ("fromAccountId","fromLocation","toAccountId","toLocation","amount") VALUES ($1,$2,$3,$4,$5) RETURNING "txnId"`,
  [data.fromAccountId, data.fromLocation, data.toAccountId, data.toLocation, data.amount]);
  // TODO: better error handling.
};

const updateAccountBalanceFunc = async (txnCtxt: TransactionContext, acctId: string | number, balance: number | string) => {
  await txnCtxt.client.query<AccountInfo>(`UPDATE "AccountInfo" SET "balance" = $2 WHERE "accountId" = $1`, [acctId, balance]);
  // TODO: better error handling.
};

const updateAcctTransactionFunc = async (txnCtxt: TransactionContext, acctId: number | string, data: TransactionHistory, deposit: boolean) => {
  // First, make sure the account exists, and read the latest balance.
  const acct = await findAccountFunc(txnCtxt, acctId);
  if (acct === null) {
    console.error("Cannot find account!");
    await txnCtxt.rollback();
    return false;
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
      return false;
    }
  }
  await updateAccountBalanceFunc(txnCtxt, acctId, newBalance);

  // Insert transaction history.
  await insertTxnHistoryFunc(txnCtxt, data);
  
  return true;
};

export const internalTransferFunc = async (txnCtxt: TransactionContext, data: TransactionHistory): Promise<RouterResponse> => {
  let retResponse: RouterResponse = {
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
  // TODO: pg returns bigint as string. So we need to convert it first. Need better support for BigInt.
  await updateAccountBalanceFunc(txnCtxt, data.fromAccountId, Number(fromAccount.balance) - Number(data.amount));
  await updateAccountBalanceFunc(txnCtxt, data.toAccountId, Number(toAccount.balance) + Number(data.amount));
  await insertTxnHistoryFunc(txnCtxt, data);

  retResponse.body = "Internal transfer succeeded!";
  retResponse.status = 200;

  return retResponse;
};

export const depositWorkflow = async (ctxt: WorkflowContext, data: TransactionHistory) => {
  let retResponse: RouterResponse = {
    body: "",
    status: 200,
    message: ""
  };

  // ToAccount must exist.
  let toAccount: AccountInfo | null = null;
  if (data.toAccountId !== undefined) {
      toAccount = await ctxt.transaction(findAccountFunc, data.toAccountId);
  }
  if ((toAccount === null) || (data.toAccountId === undefined)) {
      console.error("Cannot find account!");
      retResponse.status = 500;
      retResponse.message = "Cannot find account!";
      return retResponse;
  }

  // Contact remote DB to withdraw first.
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
      // TODO: implement.
  } else {
      console.log("Deposit from: " + data.fromLocation);
  }

  // Then, complete the deposit.
  const result: boolean = await ctxt.transaction(updateAcctTransactionFunc, data.toAccountId, data, true);
  if (result) {
    retResponse.body = "Deposit success!";
    retResponse.status = 200;
  } else {
    retResponse.body = "Deposit failed!";
    retResponse.status = 500;
  }

  return retResponse;
};


export const withdrawWorkflow = async (ctxt: WorkflowContext, data: TransactionHistory) => {
  let retResponse: RouterResponse = {
    body: "",
    status: 200,
    message: ""
  };

  // FromAccount must exist.
  let fromAccount: AccountInfo | null = null;
  if (data.fromAccountId !== undefined) {
      fromAccount = await ctxt.transaction(findAccountFunc, data.fromAccountId);
  }
  if ((fromAccount === null) || (data.fromAccountId === undefined)) {
      console.error("Cannot find account!");
      retResponse.status = 500;
      retResponse.message = "Cannot find account!";
      return retResponse;
  }

  const fromBalance = fromAccount.balance ?? 0;
  data.amount = data.amount ?? 0;
  if (fromBalance < data.amount) {
    console.error("Not enough balance to withdraw!");
    retResponse.status = 500;
    retResponse.message = "Not enough balance to withdraw!";
    return retResponse;
  }

  // Contact remote DB to deposit first.
  if (data.toLocation && !(data.toLocation === 'cash') && !data.toLocation.startsWith(REMOTEDB_PREFIX)) {
      console.log("Deposit to another DB: " + data.toLocation + ", account: " + data.toAccountId);
      const remoteUrl = data.fromLocation + "/api/deposit";
      const thReq : TransactionHistory = {
          fromAccountId: data.fromAccountId,
          toAccountId: data.toAccountId,
          amount: data.amount,
          toLocation: 'local',
          fromLocation: REMOTEDB_PREFIX + bankname + ":" + bankport
      };
      // TODO: implement.
  } else {
      console.log("Deposit to: " + data.fromLocation);
  }

  // Then, complete the withdraw.
  const result: boolean = await ctxt.transaction(updateAcctTransactionFunc, data.fromAccountId, data, false);
  if (result) {
    retResponse.body = "Withdraw success!";
    retResponse.status = 200;
  } else {
    // TODO: need to roll back previous operation (withdraw or deposit), probably contact the remote server.
    retResponse.body = "Withdraw failed!";
    retResponse.status = 500;
  }

  return retResponse;
};
