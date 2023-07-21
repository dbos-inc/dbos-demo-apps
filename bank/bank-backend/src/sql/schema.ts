export const BankSchema = {
  // Generated from prisma.
  // Note: must use double quotes in Postgres to match the upper case letters.
  accountInfoTable: `
    CREATE TABLE IF NOT EXISTS "AccountInfo" (
      "accountId" BIGSERIAL NOT NULL,
      "ownerName" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "balance" BIGINT NOT NULL,
      CONSTRAINT "AccountInfo_pkey" PRIMARY KEY ("accountId")
    );`,
  
  transactionHistoryTable: `
    CREATE TABLE IF NOT EXISTS "TransactionHistory" (
      "txnId" BIGSERIAL NOT NULL,
      "fromAccountId" BIGINT NOT NULL,
      "fromLocation" TEXT NOT NULL,
      "toAccountId" BIGINT NOT NULL,
      "toLocation" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TransactionHistory_pkey" PRIMARY KEY ("txnId")
    );`
}

export interface AccountInfo {
  accountId?: bigint;
  ownerName?: string;
  type?: string;
  balance?: bigint;
}