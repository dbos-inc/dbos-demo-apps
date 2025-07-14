import {
  DBOS,
} from "@dbos-inc/dbos-sdk";

import { dkoa, prisma } from "../resources";

import { bankAuthMiddleware, bankJwt, koaLogger } from "../middleware";

import { PrismaClient } from "@prisma/client";

@DBOS.defaultRequiredRole(["appUser"])
@dkoa.authentication(bankAuthMiddleware)
@dkoa.koaMiddleware(koaLogger, bankJwt)
export class BankAccountInfo {
  @prisma.transaction()
  @dkoa.getApi("/api/list_accounts/:ownerName")
  static async listAccountsFunc(ownerName: string) {
    return (prisma.client).accountInfo.findMany({
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

  @prisma.transaction()
  @dkoa.getApi("/api/list_all_accounts")
  static async listAllAccountsFunc() {
    return (prisma.client).accountInfo.findMany({
      orderBy: {
        accountId: "asc",
      },
    });
  }

  @prisma.transaction()
  @dkoa.postApi("/api/create_account")
  @DBOS.requiredRole(["appAdmin"]) // Only an admin can create a new account.
  static async createAccountFunc(ownerName: string, type: string, balance?: number) {
    return (prisma.client).accountInfo.create({
      data: {
        ownerName: ownerName,
        type: type,
        balance: BigInt(balance ?? 0),
      },
    });
  }

  static async findAccountFunc(acctId: bigint) {
    return (prisma.client).accountInfo.findUnique({
      where: {
        accountId: acctId,
      },
    });
  }
}
