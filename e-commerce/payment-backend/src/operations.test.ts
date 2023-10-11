/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { OperonTestingRuntime, createTestingRuntime } from "@dbos-inc/operon";
import { PlaidPayments, Session } from "./operations";
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
    const req = {
      success_url: "http://fakehost/success",
      cancel_url: "http://fakehost/cancel",
      client_reference_id: "fake-client-ref"
    };

    const resp1 = await request(testRuntime.getHandlersCallback())
      .post("/api/create_payment_session")
      .send(req);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const session_id = resp1.body.session_id as string;

    const resp2 = await request(testRuntime.getHandlersCallback())
      .get(`/api/session_status?session_id=${session_id}`);
    const body = resp2.body as Session;

    expect(body.success_url).toBe(req.success_url);
    expect(body.cancel_url).toBe(req.cancel_url);
    expect(body.client_reference_id).toBe(req.client_reference_id);

  });
});