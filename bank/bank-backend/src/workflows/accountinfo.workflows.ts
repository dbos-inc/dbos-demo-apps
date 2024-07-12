import { ArgOptional, ArgSource, ArgSources, Authentication, DefaultRequiredRole, GetApi, KoaMiddleware, Transaction, PostApi, RequiredRole, TransactionContext } from "@dbos-inc/dbos-sdk";
import { PrismaClient } from "@prisma/client";
import { bankAuthMiddleware, bankJwt, koaLogger } from "../middleware";

type PrismaContext = TransactionContext<PrismaClient>;

@DefaultRequiredRole(["appUser"])
@Authentication(bankAuthMiddleware)
@KoaMiddleware(koaLogger, bankJwt)
export class BankAccountInfo {
  @Transaction()
  @GetApi("/api/list_accounts/:ownerName")
  static async listAccountsFunc(txnCtxt: PrismaContext, @ArgSource(ArgSources.URL) ownerName: string) {
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

  @Transaction()
  @GetApi("/api/list_all_accounts")
  static async listAllAccountsFunc(txnCtxt: PrismaContext) {
    return txnCtxt.client.accountInfo.findMany({
      orderBy: {
        accountId: "asc",
      },
    });
  }

  @Transaction()
  @PostApi("/api/create_account")
  @RequiredRole(["appAdmin"]) // Only an admin can create a new account.
  static async createAccountFunc(txnCtxt: PrismaContext, ownerName: string, type: string, @ArgOptional balance?: number) {
    return txnCtxt.client.accountInfo.create({
      data: {
        ownerName: ownerName,
        type: type,
        balance: BigInt(balance ?? 0),
      },
    });
  }

  @Transaction()
  static async findAccountFunc(txnCtxt: PrismaContext, acctId: bigint) {
    return txnCtxt.client.accountInfo.findUnique({
      where: {
        accountId: acctId,
      },
    });
  }
}
