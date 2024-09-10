-- CreateTable
CREATE TABLE "AccountInfo" (
    "accountId" BIGSERIAL NOT NULL,
    "ownerName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "balance" BIGINT NOT NULL,

    CONSTRAINT "AccountInfo_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "TransactionHistory" (
    "txnId" BIGSERIAL NOT NULL,
    "fromAccountId" BIGINT NOT NULL,
    "fromLocation" TEXT NOT NULL,
    "toAccountId" BIGINT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionHistory_pkey" PRIMARY KEY ("txnId")
);
