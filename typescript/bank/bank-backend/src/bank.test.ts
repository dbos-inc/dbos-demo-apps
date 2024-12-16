import { DBOS, parseConfigFile } from "@dbos-inc/dbos-sdk";
import { BankEndpoints as _endpoints, BankAccountInfo, BankTransactionHistory } from "./operations";
import request from "supertest";
import { AccountInfo, TransactionHistory } from "@prisma/client";
import { convertTransactionHistory } from "./router";

describe("bank-tests", () => {
  beforeAll(async () => {
    //testRuntime = await createTestingRuntime([BankEndpoints, BankAccountInfo, BankTransactionHistory], "dbos-test-config.yaml");
    //export function parseConfigFile(cliOptions?: ParseOptions, useProxy: boolean = false): [DBOSConfig, DBOSRuntimeConfig] {
    const [dbosConfig, rtConfig] = parseConfigFile({configfile: "dbos-test-config.yaml"});
    DBOS.setConfig(dbosConfig, rtConfig);

    await DBOS.launch();
    await DBOS.launchAppHTTPServer();
    await DBOS.executor.queryUserDB(`delete from "AccountInfo" where "ownerName"=$1;`, ["alice"]);
  });

  afterAll(async () => {
    await DBOS.shutdown();
  });

  // eslint-disable-next-line @typescript-eslint/require-await
  test("test-greeting", async () => {
    const response = await request(DBOS.getHTTPHandlersCallback()).get("/api/greeting");
    expect(response.statusCode).toBe(401); // This is because we don't have a valid JWT token.
  });

  test("test-create-account", async () => {
    await DBOS.withAuthedContext('admin', ['appAdmin'], async () => {
      await expect(BankAccountInfo.createAccountFunc("alice", "saving", 0)).resolves.toMatchObject({
        ownerName: "alice",
        type: "saving",
      });
    });

    const res = await DBOS.executor.queryUserDB(`select * from "AccountInfo" where "ownerName" = $1;`, ["alice"]) as AccountInfo[];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res[0].ownerName).toBe("alice");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res[0].type).toBe("saving");
  });

  test("test-workflow", async () => {
    await DBOS.withAuthedContext('user', ['appUser'], async () => {
      // Find the account we created for alice.
      const resList: AccountInfo[] = await BankAccountInfo.listAccountsFunc("alice");
      expect(resList.length).toBe(1);
      const acctId = resList[0].accountId;

      // Run deposit.
      let res = await BankTransactionHistory
        .depositWorkflow(convertTransactionHistory({ fromLocation: "cash", toAccountId: acctId, toLocation: "local", amount: 100 } as TransactionHistory));
      expect(res).toBe("Deposit succeeded!");

      // Run withdraw.
      res = await BankTransactionHistory
        .withdrawWorkflow(convertTransactionHistory({ toLocation: "cash", fromAccountId: acctId, fromLocation: "local", amount: 50 } as TransactionHistory));
      expect(res).toBe("Withdraw succeeded!");

      // Try to overdraw.
      await expect(
        BankTransactionHistory
          .withdrawWorkflow(convertTransactionHistory({ toLocation: "cash", fromAccountId: acctId, fromLocation: "local", amount: 100 } as TransactionHistory))
      ).rejects.toThrow("Not enough balance!");
    });
  });
});
