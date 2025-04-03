import { DBOS } from "@dbos-inc/dbos-sdk";
import { Shop, Product, checkout_url_topic } from "./operations";
import request from "supertest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("operations", () => {

  beforeAll(async () => {
    await DBOS.launch();
    await DBOS.launchAppHTTPServer();
  });

  afterAll(async () => {
    await DBOS.shutdown();
  });

  // This is a demonstration of the handler-based approach to making calls
  test("register", async () => {
    const req = {
      username: 'shopper',
      password: 'shopperpass',
    };
    const resp1 = await request(DBOS.getHTTPHandlersCallback())
      .post("/api/register")
      .send(req);
    expect(resp1.status).toBe(204);

    const resp2 = await request(DBOS.getHTTPHandlersCallback())
      .post("/api/register")
      .send(req);
    expect(resp2.status).toBe(400); // Already exists
  });

  // This is a demonstration of the testing-runtime approach to making calls
  test("login", async () => {
    expect(() => Shop.login('nosuchshopper', 'shopperpass')).rejects.toThrow();
    expect(() => Shop.login('shopper', 'incorrectpass')).rejects.toThrow();
    await Shop.login('shopper','shopperpass');
  });

  test("products", async () => {
    const prods = await Shop.getProducts();
    expect(prods.length).toBe(2);
    await Shop.getProduct(prods[0].product_id);
    expect(Shop.getProduct(9801)).resolves.toBeNull();
  
    // Check URL version also
    const ppresp = await request(DBOS.getHTTPHandlersCallback())
      .get(`/api/products/${prods[0].product_id}`);
    expect(ppresp.status).toBe(200);
    const bpresp = await request(DBOS.getHTTPHandlersCallback())
      .get(`/api/products/xyzzy`);
    expect(bpresp.status).toBe(400);
    const bpresp2 = await request(DBOS.getHTTPHandlersCallback())
      .get(`/api/products/9801`);
    expect(bpresp2.status).toBe(204);
  });

  test("shopping", async () => {
    const bacr = {'username': 'noshopper', 'product_id':1};
    const bcresp = await request(DBOS.getHTTPHandlersCallback())
      .post("/api/add_to_cart")
      .send(bacr);
    expect(bcresp.status).toBe(500);

    const bacr2 ={'username': 'shopper', 'product_id':9801};
    const bcresp2 = await request(DBOS.getHTTPHandlersCallback())
      .post("/api/add_to_cart")
      .send(bacr2);
    expect(bcresp2.status).toBe(500);

    await Shop.addToCart('shopper', 1);
    const cart = await Shop.getCart('shopper');
    expect(cart.length).toBe(1);

    const bgcr = {'username': 'noshopper'}
    const bgcresp = await request(DBOS.getHTTPHandlersCallback())
      .post("/api/get_cart")
      .send(bgcr);
    expect(bgcresp.status).toBe(400);

    const bcoresp = await request(DBOS.getHTTPHandlersCallback())
      .post(`/api/checkout_session?username=noshopper`).set("Origin", "xxx");
    expect(bcoresp.status).toBe(400);

    // Spy on / stub out the URL fetch
    const paySpy = jest.spyOn(Shop, 'placePaymentSessionRequest');
    paySpy.mockImplementation(async (productDetails: Product[], _origin: string) => {
      return {
        session_id: "1234",
        url:DBOS.workflowID,
        payment_status: "pending",
      };
    });

    // Initiate checkout
    const handle = await DBOS.startWorkflow(Shop).paymentWorkflow('shopper', 'xxx');
    const url = await DBOS.getEvent<string>(handle.workflowID, checkout_url_topic);
    if (!url) throw new Error("URL not returned");

    // Fake a payment reply 
    const payresp = await request(DBOS.getHTTPHandlersCallback())
    .post(`/payment_webhook`).send({session_id: "1234", client_reference_id: handle.workflowID, payment_status: "paid"});
    expect(payresp.status).toBe(204);

    // After the payment has succeeded, your cart should be emptied
    let cart_empty = false;
    for (let i=0; i<10; ++i) {
      const ecart = await Shop.getCart('shopper');
      if (ecart.length === 0) {
        cart_empty = true;
        break;
      }
      await sleep(100);
    }
    expect(cart_empty).toBe(true);

    expect(paySpy).toHaveBeenCalled();
    paySpy.mockRestore();

    // Check inventory restored
    const p = await Shop.getInventory(1);
    expect(p).toBe(99999);
  });

  test("cancel order", async () => {
    await Shop.addToCart('shopper', 1);
    const cart = await Shop.getCart('shopper');
    expect(cart.length).toBe(1);

    // Spy on / stub out the URL fetch
    const paySpy = jest.spyOn(Shop, 'placePaymentSessionRequest');
    paySpy.mockImplementation(async (_productDetails: Product[], _origin: string) => {
      return {
        session_id: "1234",
        url: DBOS.workflowID,
        payment_status: "pending",
      };
    });

    // Initiate checkout
    const handle = await DBOS.startWorkflow(Shop).paymentWorkflow('shopper', 'xxx');
    const url = await DBOS.getEvent<string>(handle.workflowID, checkout_url_topic);
    if (!url) throw new Error("URL not returned");

    // Check inventory temporary deduction
    const p = await Shop.getInventory(1);
    expect(p).toBe(99998);

    // Fake a payment cancel reply
    const payresp = await request(DBOS.getHTTPHandlersCallback())
    .post(`/payment_webhook`).send({session_id: "1234", client_reference_id: handle.workflowID, payment_status: "canceled"});
    expect(payresp.status).toBe(204);
    try {await handle.getResult();} catch (e) {}

    // After the payment has failed, your cart should be emptied
    let cart_empty = false;
    for (let i=0; i<10; ++i) {
      const ecart = await Shop.getCart('shopper');
      if (ecart.length === 0) {
        cart_empty = true;
        break;
      }
      await sleep(100);
    }
    expect(cart_empty).toBe(false); // We leave it in cart when payment is canceled

    expect(paySpy).toHaveBeenCalled();
    paySpy.mockRestore();

    // Check inventory restored
    const p2 = await Shop.getInventory(1);
    expect(p2).toBe(99999);
  });

  test("throw from subtract inventory", async () => {
    await Shop.addToCart('shopper', 1);
    const cart = await Shop.getCart('shopper');
    expect(cart.length).toBe(1);

    // Spy on / stub out the URL fetch
    const invSpy = jest.spyOn(Shop, 'subtractInventoryInternal');
    invSpy.mockImplementation(async (_products: Product[]): Promise<void> => {
      throw new Error("Something went wrong");
    });

    // Initiate checkout
    const handle = await DBOS.startWorkflow(Shop).paymentWorkflow('shopper', 'xxx');
    const url = await DBOS.getEvent<string>(handle.workflowID, checkout_url_topic);
    expect(url).toBeNull();
    try {await handle.getResult();} catch (e) {}

    expect(invSpy).toHaveBeenCalled();
    invSpy.mockRestore();

    // Check inventory (was never deducted)
    const p2 = await Shop.getInventory(1);
    expect(p2).toBe(99999);
  });
});

