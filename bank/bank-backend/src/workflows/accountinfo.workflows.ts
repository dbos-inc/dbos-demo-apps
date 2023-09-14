import { OperonTransaction, TransactionContext } from "operon";
import { AccountInfo, PrismaClient } from "@prisma/client";

export class BankAccountInfo {

  @OperonTransaction()
  static async listAccountsFunc (txnCtxt: TransactionContext, name: string) {
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
  }

  @OperonTransaction()
  static async createAccountFunc (txnCtxt: TransactionContext, data: AccountInfo) {
    const p = txnCtxt.prismaClient as PrismaClient;
    return p.accountInfo.create({ data: {
      ownerName: data.ownerName,
      type: data.type,
      balance: data.balance
    }});
  }

  @OperonTransaction()
  static async findAccountFunc (txnCtxt: TransactionContext, acctId: bigint) {
    const p = txnCtxt.prismaClient as PrismaClient;
    return p.accountInfo.findUnique({
      where: {
        accountId: acctId,
      }
    });
  }
}
