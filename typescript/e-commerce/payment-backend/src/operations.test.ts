import Koa from 'koa';
import Router from '@koa/router';

import { DBOS } from "@dbos-inc/dbos-sdk";
import { PaymentItem, PaymentSessionInformation, dkoa, payment_complete_topic, setUnitTest } from "./operations";
import request from "supertest";

describe("operations", () => {
  const koa = new Koa();
  const router = new Router();

  beforeAll(async () => {
    process.env['frontend_host'] = 'http://localhost:8086';
    await DBOS.launch();
    dkoa.registerWithApp(koa, router);

    await DBOS.queryUserDB(`delete from items;`);
    await DBOS.queryUserDB(`delete from session;`);
    setUnitTest();
  });

  afterAll(async () => {
    await DBOS.shutdown();
  });

  test("foo", async () => {
    const req = {
      webhook: "http://fakehost/webhook",
      success_url: "http://fakehost/success",
      cancel_url: "http://fakehost/cancel",
      client_reference_id: "fake-client-ref",
      items: <PaymentItem[]>[
        { description: "widget", quantity: 10, price: 9.99 },
        { description: "plumbus", quantity: 5, price: 19.99 }
      ]
    };

    const resp1 = await request(koa.callback())
      .post("/api/create_payment_session")
      .send(req);
    console.log(`${JSON.stringify(resp1)}`);
    expect(resp1.status).toBe(200);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const session_id = resp1.body.session_id as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const url = new URL(resp1.body.url as string);
    expect(url.pathname).toBe(`/payment/${session_id}`);

    const resp2 = await request(koa.callback())
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
    await DBOS.send(session_id, null, payment_complete_topic);
    await DBOS.retrieveWorkflow(session_id).getResult();
  });
});
