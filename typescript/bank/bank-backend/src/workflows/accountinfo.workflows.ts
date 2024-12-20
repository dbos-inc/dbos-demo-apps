import {
  DBOS,
  ArgOptional,
  ArgSource,
  ArgSources,
  Authentication,
  KoaMiddleware,
} from "@dbos-inc/dbos-sdk";

import { bankAuthMiddleware, bankJwt, koaLogger } from "../middleware";

import { PrismaClient } from "@prisma/client";

@DBOS.defaultRequiredRole(["appUser"])
@Authentication(bankAuthMiddleware)
@KoaMiddleware(koaLogger, bankJwt)
export class BankAccountInfo {
  @DBOS.transaction()
  @DBOS.getApi("/api/list_accounts/:ownerName")
  static async listAccountsFunc(@ArgSource(ArgSources.URL) ownerName: string) {
    return (DBOS.prismaClient as PrismaClient).accountInfo.findMany({
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

  @DBOS.transaction()
  @DBOS.getApi("/api/list_all_accounts")
  static async listAllAccountsFunc() {
    return (DBOS.prismaClient as PrismaClient).accountInfo.findMany({
      orderBy: {
        accountId: "asc",
      },
    });
  }

  @DBOS.transaction()
  @DBOS.postApi("/api/create_account")
  @DBOS.requiredRole(["appAdmin"]) // Only an admin can create a new account.
  static async createAccountFunc(ownerName: string, type: string, @ArgOptional balance?: number) {
    return (DBOS.prismaClient as PrismaClient).accountInfo.create({
      data: {
        ownerName: ownerName,
        type: type,
        balance: BigInt(balance ?? 0),
      },
    });
  }

  static async findAccountFunc(acctId: bigint) {
    return (DBOS.prismaClient as PrismaClient).accountInfo.findUnique({
      where: {
        accountId: acctId,
      },
    });
  }
}
