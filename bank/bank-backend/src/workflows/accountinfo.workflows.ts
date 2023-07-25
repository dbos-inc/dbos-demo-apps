import { TransactionContext } from "operon";
import { AccountInfo } from "../sql/schema";

export const listAccountsFunc = async (txnCtxt: TransactionContext, name: string) => {
  const { rows } = await txnCtxt.client.query<AccountInfo>(`SELECT "accountId", "ownerName", "type", "balance" FROM "AccountInfo" WHERE "ownerName" = $1 ORDER BY "accountId" ASC;`, [name]);
  return rows;
};

export const createAccountFunc = async (txnCtxt: TransactionContext, data: AccountInfo) => {
  const { rows } = await txnCtxt.client.query<AccountInfo>(`INSERT INTO "AccountInfo" ("ownerName","type","balance") VALUES ($1,$2,$3) RETURNING "accountId";`, [data.ownerName, data.type, data.balance]);
  if (rows.length === 0) {
    console.error("Failed to create account!");
    throw Error("Failed to create account!");
  }
  return rows[0];
};

export const findAccountFunc = async (txnCtxt: TransactionContext, acctId: string | number) => {
  if (!acctId) {
    return null;
  }
  const { rows } = await txnCtxt.client.query<AccountInfo>(`SELECT "accountId", "ownerName", "type", "balance" FROM "AccountInfo" WHERE "accountId" = $1`, [acctId]);
  if (rows.length === 0) {
    return null;
  }
  return rows[0];
};
