/* eslint-disable @typescript-eslint/no-unused-vars */
import { OperonTestingRuntime, createTestingRuntime } from "@dbos-inc/operon";
import { PlaidPayments } from "./operations";
import request from "supertest";

describe("operations", () => {

  let testRuntime: OperonTestingRuntime;

  beforeAll(async () => {
    testRuntime = await createTestingRuntime([PlaidPayments], undefined, "info");
    await testRuntime.queryUserDB<void>(`delete from session;`);
  });

  afterAll(async () => {
    await testRuntime.destroy();
  });


  test("foo", async () => {
    const response = await request(testRuntime.getHandlersCallback())
      .post("/api/create_payment_session")
      .send({
        success_url: "http://localhost:3000/success",
        cancel_url: "http://localhost:3000/cancel",
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const session_id = response.body.session_id;

      const response2 = await request(testRuntime.getHandlersCallback())
        .get(`/api/session_status?session_id=${session_id}`);
    
  });
});