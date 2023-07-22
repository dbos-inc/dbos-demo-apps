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

const updateAcctTransactionFunc = async (txnCtxt: TransactionContext, acctId: number | string, data: TransactionHistory) => {
  // First, make sure the account exists, and read the latest balance.
  const { rows } = await txnCtxt.client.query<AccountInfo>(`SELECT "accountId", "ownerName", "type", "balance" FROM "AccountInfo" WHERE "accountId" = $1`, [acctId]);
  if (rows.length === 0) {
    console.error("Cannot find account!");
    return false;
  }

  // Update account balance.
  const toBalance: number = Number(rows[0].balance) + Number(data.amount);
  await txnCtxt.client.query<AccountInfo>(`UPDATE "AccountInfo" SET "balance" = $2 WHERE "accountId" = $1`, [acctId, toBalance]);

  // Insert transaction history.
  await txnCtxt.client.query<TransactionHistory>(`INSERT INTO "TransactionHistory" ("fromAccountId","fromLocation","toAccountId","toLocation","amount") VALUES ($1,$2,$3,$4,$5) RETURNING "txnId"`,
    [data.fromAccountId, data.fromLocation, data.toAccountId, data.toLocation, data.amount]);

  // TODO: better error handling.
  return true;
}

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
          toLocation: REMOTEDB_PREFIX + bankname + ":" + bankport,
          txnId: -1
      };
      // TODO: implement.
  } else {
      console.log("Deposit from: " + data.fromLocation);
  }

  // Then, complete the deposit.
  const result: boolean = await ctxt.transaction(updateAcctTransactionFunc, data.toAccountId, data);
  if (result) {
    retResponse.body = "Deposit success!";
    retResponse.status = 200;
  } else {
    retResponse.body = "Deposit failed!";
    retResponse.status = 500;
  }

  return retResponse;
};