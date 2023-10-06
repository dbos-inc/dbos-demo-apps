import { Authentication, DefaultRequiredRole, GetApi, KoaMiddleware, OperonTransaction, PostApi, RequiredRole, TransactionContext } from "@dbos-inc/operon";
import { PrismaClient } from "@prisma/client";
import { bankAuthMiddleware, bankJwt, customizeHandle, koaLogger } from "../middleware";

type PrismaContext = TransactionContext<PrismaClient>;

@DefaultRequiredRole(["appUser"])
@Authentication(bankAuthMiddleware)
@KoaMiddleware(koaLogger, customizeHandle, bankJwt)
export class BankAccountInfo {
  @OperonTransaction()
  @GetApi("/api/list_accounts/:ownerName")
  static async listAccountsFunc(txnCtxt: PrismaContext, ownerName: string) {
    return txnCtxt.client.accountInfo.findMany({
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
  @RequiredRole(["appAdmin"]) // Only an admin can create a new account.
  static async createAccountFunc(txnCtxt: PrismaContext, ownerName: string, type: string, balance: number) {
    return txnCtxt.client.accountInfo.create({
      data: {
        ownerName: ownerName,
        type: type,
        balance: BigInt(balance ?? 0),
      },
    });
  }

  @OperonTransaction()
  static async findAccountFunc(txnCtxt: PrismaContext, acctId: bigint) {
    return txnCtxt.client.accountInfo.findUnique({
      where: {
        accountId: acctId,
      },
    });
  }
}
