import { TestingRuntime, createTestingRuntime } from "@dbos-inc/dbos-sdk";
import { Shop, DisplayProduct } from "./operations";
import request from "supertest";

describe("operations", () => {

  let testRuntime: TestingRuntime;

  beforeAll(async () => {
    testRuntime = await createTestingRuntime([Shop], undefined);
    await testRuntime.queryUserDB<void>(`delete from users;`);
  });

  afterAll(async () => {
    await testRuntime.destroy();
  });


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
    expect(resp2.status).toBe(400);
  });

  test("login", async () => {
    const breq1 = {
      username: 'nosuchsshopper',
      password: 'shopperpass',
    };
    const bresp1 = await request(testRuntime.getHandlersCallback())
      .post("/api/login")
      .send(breq1);
    expect(bresp1.status).toBe(400);

    const breq2 = {
      username: 'nosuchsshopper',
      password: 'incorrectpass',
    };
    const bresp2 = await request(testRuntime.getHandlersCallback())
      .post("/api/login")
      .send(breq2);
    expect(bresp2.status).toBe(400);

    const req = {
      username: 'shopper',
      password: 'shopperpass',
    };
    const resp1 = await request(testRuntime.getHandlersCallback())
      .post("/api/login")
      .send(req);
    expect(resp1.status).toBe(204);
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

  // products/:id
  // add_to_cart
  // get_cart
  // checkout_session
});

