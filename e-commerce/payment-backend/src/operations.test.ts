import { OperonTestingRuntime, createTestingRuntime } from "@dbos-inc/operon";
import { PlaidPayments, PaymentItem, PaymentSessionInformation, payment_complete_topic } from "./operations";
import request from "supertest";
import { parseConfigFile } from '@dbos-inc/operon/dist/src/operon-runtime/config';
import { Client } from 'pg';
describe("operations", () => {

  let testRuntime: OperonTestingRuntime;

  beforeAll(async () => {
    const [operonConfig,] = parseConfigFile();
    const pg = new Client({ ...operonConfig.poolConfig, database: 'postgres' });
    await pg.connect();
    await pg.query(`DROP DATABASE IF EXISTS ${operonConfig.system_database}`);
    await pg.end();

    testRuntime = await createTestingRuntime([PlaidPayments], undefined, "info");
    await testRuntime.queryUserDB<void>(`delete from items;`);
    await testRuntime.queryUserDB<void>(`delete from session;`);
  });

  afterAll(async () => {
    await testRuntime.destroy();
  });


  test("foo", async () => {
    const req = {
      success_url: "http://fakehost/success",
      cancel_url: "http://fakehost/cancel",
      client_reference_id: "fake-client-ref",
      items: <PaymentItem[]>[
        { description: "widget", quantity: 10, price: 9.99 },
        { description: "plumbus", quantity: 5, price: 19.99 }
      ]
    };

    const resp1 = await request(testRuntime.getHandlersCallback())
      .post("/api/create_payment_session")
      .send(req);
    expect(resp1.status).toBe(200);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const session_id = resp1.body.session_id as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const url = new URL(resp1.body.url as string);
    expect(url.pathname).toBe(`/payment/${session_id}`);

    const resp2 = await request(testRuntime.getHandlersCallback())
      .get(`/api/session_info/${session_id}`);
    expect(resp2.status).toBe(200);

    expect(resp2.body).toBeDefined();
    const body = resp2.body as PaymentSessionInformation;
    expect(body.session_id).toBe(session_id);
    expect(body.success_url).toBe(req.success_url);
    expect(body.cancel_url).toBe(req.cancel_url);
    expect(body.status).toBeFalsy();
    expect(body.items.length).toBe(req.items.length);

    // send a payment_complete_topic message to complete the workflow
    testRuntime.send(session_id, null, payment_complete_topic);
    await testRuntime.retrieveWorkflow(session_id).getResult();
  });
});