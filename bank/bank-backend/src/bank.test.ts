import { OperonTestingRuntime, createTestingRuntime } from "@dbos-inc/operon";
import { BankEndpoints, BankAccountInfo, BankTransactionHistory } from "./userFunctions";
import request from "supertest";
import { AccountInfo, TransactionHistory } from "@prisma/client";
import { convertTransactionHistory } from "./router";

describe("bank-tests", () => {
  let testRuntime: OperonTestingRuntime;

  beforeAll(async () => {
    testRuntime = await createTestingRuntime([BankEndpoints, BankAccountInfo, BankTransactionHistory], undefined, "info");
    await testRuntime.queryUserDB<void>(`delete from prisma."AccountInfo" where "ownerName"=$1;`, "alice");
  });

  afterAll(async () => {
    await testRuntime.destroy();
  });

  // eslint-disable-next-line @typescript-eslint/require-await
  test("test-greeting", async () => {
    const response = await request(testRuntime.getHandlersCallback()).get("/api/greeting");
    expect(response.statusCode).toBe(401); // This is because we don't have a valid JWT token.
  });

  test("test-create-account", async () => {
    await expect(testRuntime.invoke(BankAccountInfo, undefined, { authenticatedRoles: ["appAdmin"] }).createAccountFunc("alice", "saving", 0)).resolves.toMatchObject({
      ownerName: "alice",
      type: "saving",
    });

    const res = await testRuntime.queryUserDB<AccountInfo>(`select * from prisma."AccountInfo" where "ownerName" = $1;`, "alice");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res[0].ownerName).toBe("alice");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res[0].type).toBe("saving");
  });

  test("test-workflow", async () => {
    // Find the account we created for alice.
    const resList: AccountInfo[] = await testRuntime.invoke(BankAccountInfo, undefined, { authenticatedRoles: ["appUser"] }).listAccountsFunc("alice");
    expect(resList.length).toBe(1);
    const acctId = resList[0].accountId;

    // Run deposit.
    let res = await testRuntime
      .invoke(BankTransactionHistory, undefined, { authenticatedRoles: ["appUser"] })
      .depositWorkflow(convertTransactionHistory({ fromLocation: "cash", toAccountId: acctId, toLocation: "local", amount: 100 } as TransactionHistory))
      .then((x) => x.getResult());
    expect(res).toBe("Deposit succeeded!");

    // Run withdraw.
    res = await testRuntime
      .invoke(BankTransactionHistory, undefined, { authenticatedRoles: ["appUser"] })
      .withdrawWorkflow(convertTransactionHistory({ toLocation: "cash", fromAccountId: acctId, fromLocation: "local", amount: 50 } as TransactionHistory))
      .then((x) => x.getResult());
    expect(res).toBe("Withdraw succeeded!");

    // Try to overdraw.
    await expect(testRuntime
      .invoke(BankTransactionHistory, undefined, { authenticatedRoles: ["appUser"] })
      .withdrawWorkflow(convertTransactionHistory({ toLocation: "cash", fromAccountId: acctId, fromLocation: "local", amount: 100 } as TransactionHistory))
      .then((x) => x.getResult())).rejects.toThrow("Not enough balance!");
  });
});
