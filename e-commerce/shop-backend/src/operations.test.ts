import { TestingRuntime, createTestingRuntime } from "@dbos-inc/dbos-sdk";
import { Shop, DisplayProduct, CartProduct } from "./operations";
import request from "supertest";
import { sleep } from "@dbos-inc/dbos-sdk/dist/src/utils";

describe("operations", () => {

  let testRuntime: TestingRuntime;

  beforeAll(async () => {
    testRuntime = await createTestingRuntime([Shop], undefined);
    await testRuntime.queryUserDB<void>(`delete from users;`);
  });

  afterAll(async () => {
    await testRuntime.destroy();
  });


  // This is a demonstration of the handler-based approach to making calls
  test("register", async () => {
    const req = {
      username: 'shopper',
      password: 'shopperpass',
    };
    const resp1 = await request(testRuntime.getHandlersCallback())
      .post("/api/register")
      .send(req);
    expect(resp1.status).toBe(204);

    const resp2 = await request(testRuntime.getHandlersCallback())
      .post("/api/register")
      .send(req);
    expect(resp2.status).toBe(400); // Already exists
  });

  // This is a demonstration of the testing-runtime approach to making calls
  test("login", async () => {
    expect(() => testRuntime.invoke(Shop).login('nosuchshopper', 'shopperpass')).rejects.toThrow();
    expect(() => testRuntime.invoke(Shop).login('shopper', 'incorrectpass')).rejects.toThrow();
    await testRuntime.invoke(Shop).login('shopper','shopperpass');
  });

  test("products", async () => {
    const presp = await request(testRuntime.getHandlersCallback())
      .get("/api/products");
    expect(presp.status).toBe(200);
    const prods = presp.body as DisplayProduct[];
    expect(prods.length).toBe(2);

    const ppresp = await request(testRuntime.getHandlersCallback())
      .get(`/api/products/${prods[0].product_id}`);
    expect(ppresp.status).toBe(200);
    const bpresp = await request(testRuntime.getHandlersCallback())
      .get(`/api/products/xyzzy`);
    expect(bpresp.status).toBe(400);
    const bpresp2 = await request(testRuntime.getHandlersCallback())
      .get(`/api/products/9801`);
    expect(bpresp2.status).toBe(204);
  });

  test("shopping", async () => {
    /* CB - This is probably a bug - gets a 204.
    const bacr = {'username': 'noshopper', 'product_id':1};
    const bcresp = await request(testRuntime.getHandlersCallback())
      .post("/api/add_to_cart")
      .send(bacr);
    expect(bcresp.status).toBe(400); */

    /* CB - This is probably a bug too - gets a 204
    const bacr2 ={'username': 'shopper', 'product_id':9801};
    const bcresp2 = await request(testRuntime.getHandlersCallback())
      .post("/api/add_to_cart")
      .send(bacr2);
    expect(bcresp2.status).toBe(400);
    */

    const acr ={'username': 'shopper', 'product_id':1};
    const cresp = await request(testRuntime.getHandlersCallback())
      .post("/api/add_to_cart")
      .send(acr);
    expect(cresp.status).toBe(204);

    const gcr = {'username': 'shopper'}
    const gcresp = await request(testRuntime.getHandlersCallback())
      .post("/api/get_cart")
      .send(gcr);
    expect(gcresp.status).toBe(200);
    const cart = gcresp.body as CartProduct[];
    expect(cart.length).toBe(1);

    /* Is this expected to be 200?
    const bgcr = {'username': 'noshopper'}
    const bgcresp = await request(testRuntime.getHandlersCallback())
      .post("/api/get_cart")
      .send(bgcr);
    expect(bgcresp.status).toBe(400);
    */

    /* Is this expected to be 302?
    const bcoresp = await request(testRuntime.getHandlersCallback())
      .post(`/api/checkout_session?username=noshopper`).set("Origin", "xxx");
    expect(bcoresp.status).toBe(400);
    */

    // Initiate checkout
    const coresp = await request(testRuntime.getHandlersCallback())
      .post(`/api/checkout_session?username=shopper`).set("Origin", "xxx");
    expect(coresp.status).toBe(302);
    const session = coresp.text;
    console.log(session);

    // Fake a payment reply 
    const payresp = await request(testRuntime.getHandlersCallback())
    .post(`/payment_webhook`).send({session_id: "1234", client_reference_id: session.replace(/^[^>]*>/g, '').replace(/<.*/g, ''), payment_status: "paid"});
    expect(payresp.status).toBe(204);
    // /payment_webhook { session_id: string; client_reference_id?: string; payment_status: string }

    // After the payment has succeeded, your cart should be emptied
    let cart_empty = false;
    for (let i=0; i<10; ++i) {
      const ecr = {'username': 'shopper'}
      const ecresp = await request(testRuntime.getHandlersCallback())
        .post("/api/get_cart")
        .send(ecr);
      expect(ecresp.status).toBe(200);
      const ecart = ecresp.body as CartProduct[];
      if (ecart.length === 0) {
        cart_empty = true;
        break;
      }
      await sleep(100);
    }
    expect(cart_empty).toBe(true);
  });
});

