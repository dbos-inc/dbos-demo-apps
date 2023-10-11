/* eslint-disable @typescript-eslint/no-unused-vars */
import { OperonTestingRuntime, createTestingRuntime } from "@dbos-inc/operon";
import { PlaidPayments } from "./operations";
import request from "supertest";

describe("operations", () => {

    let testRuntime: OperonTestingRuntime;

    beforeAll(async () => {
      testRuntime = await createTestingRuntime([PlaidPayments], undefined, "info");
    //   await testRuntime.queryUserDB<void>(`delete from prisma."AccountInfo" where "ownerName"=$1;`, "alice");
    });
  
  
    test("foo", async () => {
        const response = await request(testRuntime.getHandlersCallback())
            .post("/api/create_payment_session")
            .send({
                success_url: "http://localhost:3000/success",
                cancel_url: "http://localhost:3000/cancel",
            });

        testRuntime.getHandlersCallback();
        expect(1).toBe(1);
    });
});