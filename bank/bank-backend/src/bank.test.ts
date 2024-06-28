import { TestingRuntime, createTestingRuntime } from "@dbos-inc/dbos-sdk";
import { BankEndpoints, BankAccountInfo, BankTransactionHistory } from "./operations";
import request from "supertest";
import { AccountInfo, TransactionHistory } from "@prisma/client";
import { convertTransactionHistory } from "./router";

describe("bank-tests", () => {
  let testRuntime: TestingRuntime;
  let bankSchema: string;

  beforeAll(async () => {
    bankSchema = "public";
    testRuntime = await createTestingRuntime([BankEndpoints, BankAccountInfo, BankTransactionHistory], "dbos-test-config.yaml");
    await testRuntime.queryUserDB<void>(`delete from ${bankSchema}."AccountInfo" where "ownerName"=$1;`, "alice");
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

    const res = await testRuntime.queryUserDB<AccountInfo>(`select * from ${bankSchema}."AccountInfo" where "ownerName" = $1;`, "alice");
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
      .invokeWorkflow(BankTransactionHistory, undefined, { authenticatedRoles: ["appUser"] })
      .depositWorkflow(convertTransactionHistory({ fromLocation: "cash", toAccountId: acctId, toLocation: "local", amount: 100 } as TransactionHistory));
    expect(res).toBe("Deposit succeeded!");

    // Run withdraw.
    res = await testRuntime
      .invokeWorkflow(BankTransactionHistory, undefined, { authenticatedRoles: ["appUser"] })
      .withdrawWorkflow(convertTransactionHistory({ toLocation: "cash", fromAccountId: acctId, fromLocation: "local", amount: 50 } as TransactionHistory));
    expect(res).toBe("Withdraw succeeded!");

    // Try to overdraw.
    await expect(
      testRuntime
        .invokeWorkflow(BankTransactionHistory, undefined, { authenticatedRoles: ["appUser"] })
        .withdrawWorkflow(convertTransactionHistory({ toLocation: "cash", fromAccountId: acctId, fromLocation: "local", amount: 100 } as TransactionHistory))
    ).rejects.toThrow("Not enough balance!");
  });
});
