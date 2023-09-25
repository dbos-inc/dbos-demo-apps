import { GetApi, OperonTransaction, PostApi, RequiredRole, TransactionContext } from "operon";
import { PrismaClient } from "@prisma/client";

export class BankAccountInfo {
  @OperonTransaction()
  @GetApi("/api/list_accounts/:ownerName")
  @RequiredRole(['appUser'])
  static async listAccountsFunc(txnCtxt: TransactionContext, ownerName: string) {
    const p = txnCtxt.prismaClient as PrismaClient;
    return p.accountInfo.findMany({
      where: {
        ownerName: {
          equals: ownerName,
        },
      },
      orderBy: {
        accountId: "asc",
      },
    });
  }

  @OperonTransaction()
  @PostApi("/api/create_account")
  @RequiredRole(['appAdmin'])  // Only an admin can create a new account.
  static async createAccountFunc(txnCtxt: TransactionContext, ownerName: string, type: string, balance: number) {
    const p = txnCtxt.prismaClient as PrismaClient;
    return p.accountInfo.create({
      data: {
        ownerName: ownerName,
        type: type,
        balance: BigInt(balance ?? 0),
      },
    });
  }

  @OperonTransaction()
  static async findAccountFunc(txnCtxt: TransactionContext, acctId: bigint) {
    const p = txnCtxt.prismaClient as PrismaClient;
    return p.accountInfo.findUnique({
      where: {
        accountId: acctId,
      },
    });
  }
}
