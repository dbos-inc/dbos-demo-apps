import { DBOS } from "@dbos-inc/dbos-sdk";
import { TPCC } from "./operations";
import { getRandomInt, getCustomerName } from "./utils";
import request from "supertest";

describe("operations-test", () => {

  beforeAll(async () => {
    await DBOS.launch();
    await DBOS.launchAppHTTPServer();
  });

  afterAll(async () => {
    await DBOS.shutdown();
  });

  /**
   * Test the transaction.
   */
  test("test-newOrderTransaction", async () => {
    const w_id = 1;
    const districtID = getRandomInt(10) + 1;
    const customerID = getRandomInt(3000) + 1;

    const itemCount = Math.floor(Math.random() * 11) + 5;
    const orderLines = new Array<{ itemID: number, supplierWarehouseID: number, quantity: number, }>(itemCount);

    for (let i = 0; i < itemCount; i++) {
      const itemID = Math.floor(Math.random() * 100000) + 1;
      const quantity = Math.floor(Math.random() * 10) + 1;
      orderLines[i] = { itemID, supplierWarehouseID: 1, quantity };
    }

    const res = await TPCC.newOrder(w_id, districtID, customerID, orderLines);
    expect(res).not.toBeUndefined();
  });

  test("test-paymentTransaction-name", async () => {
    const w_id = 1;
    const d_id = getRandomInt(10) + 1;
    const c_w_id = w_id;
    const c_d_id = Math.random() < .85 ? d_id : getRandomInt(10, d_id - 1) + 1;
    const customer = getCustomerName();
    const h_amount = (getRandomInt(500000) + 100) / 100;

    const res = await TPCC.payment(w_id, d_id, c_w_id, c_d_id, customer, h_amount);
    expect(res).not.toBeUndefined();
  });

  test("test-paymentTransaction-id", async () => {
    const w_id = 1;
    const d_id = getRandomInt(10) + 1;
    const c_w_id = w_id;
    const c_d_id = Math.random() < .85 ? d_id : getRandomInt(10, d_id - 1) + 1;
    const customer = getRandomInt(3000) + 1;
    const h_amount = (getRandomInt(500000) + 100) / 100;

    const res = await TPCC.payment(w_id, d_id, c_w_id, c_d_id, customer, h_amount);
    expect(res).not.toBeUndefined();
  });

  /**
   * Test the HTTP endpoint.
   */
  test("test-paymentEndpoint", async () => {
    const res = await request(DBOS.getHTTPHandlersCallback()).get(
      "/payment/1"
    );
    expect(res.statusCode).toBe(200);
  });

  test("test-neworderEndpoint", async () => {
    const res = await request(DBOS.getHTTPHandlersCallback()).get(
      "/neworder/1"
    );
    expect(res.statusCode).toBe(200);
  });
});
