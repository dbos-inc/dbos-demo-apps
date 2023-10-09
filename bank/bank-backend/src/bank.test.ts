import { OperonTestingRuntime, createTestingRuntime } from "@dbos-inc/operon";
import { BankEndpoints, BankAccountInfo, BankTransactionHistory } from "./userFunctions";
import request from "supertest";

describe("bank-tests", () => {
  let testRuntime: OperonTestingRuntime;

  beforeAll(async () => {
    testRuntime = await createTestingRuntime([BankEndpoints, BankAccountInfo, BankTransactionHistory]);
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
  });
});
