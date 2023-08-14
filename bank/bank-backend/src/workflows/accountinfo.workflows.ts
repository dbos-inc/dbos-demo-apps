import { TransactionContext } from "operon";
import { AccountInfo, PrismaClient } from "@prisma/client";

export const listAccountsFunc = async (txnCtxt: TransactionContext, name: string): Promise<AccountInfo[]> => {
  const p = txnCtxt.prismaClient as PrismaClient;
  return p.accountInfo.findMany({
    where: {
      ownerName: {
        equals: name
      }
    },
    orderBy: {
      accountId: 'asc'
    }
  });
};

export const createAccountFunc = async (txnCtxt: TransactionContext, data: AccountInfo) => {
  const p = txnCtxt.prismaClient as PrismaClient;
  return p.accountInfo.create({ data: {
    ownerName: data.ownerName,
    type: data.type,
    balance: data.balance
  }});
};

export const findAccountFunc = async (txnCtxt: TransactionContext, acctId: bigint) => {
  const p = txnCtxt.prismaClient as PrismaClient;
  return p.accountInfo.findUnique({
    where: {
      accountId: acctId,
    }
  });
};
