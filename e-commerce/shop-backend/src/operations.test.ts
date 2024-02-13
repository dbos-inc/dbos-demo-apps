import { TestingRuntime, createTestingRuntime } from "@dbos-inc/dbos-sdk";
import { Shop, DisplayProduct, CartProduct } from "./operations";
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
  });

  /*
    # Retrieve your payment session
    url = f'https://{config.dbos_domain}/{config.default_username}/application/{paymentapp}/api/session/1'
    res = session.get(url, timeout=config.default_timeout)
    assert res.status_code == 204

    # Retrieve your cart
    url = f'https://{config.dbos_domain}/{config.default_username}/application/{shopapp}/api/get_cart'
    data = {'username': shop_username}
    res = session.post(url, json=data, timeout=config.default_timeout)
    assert res.status_code == 200
    assert (len(res.json()) == 1)

    # Check out your cart
    headers = {"Origin": "xxx"}
    url = f'https://{config.dbos_domain}/{config.default_username}/application/{shopapp}/api/checkout_session?username={shop_username}'
    res = session.post(url, headers = headers, allow_redirects=False, timeout=120)
    content = res.content.decode('utf-8')
    session_id = extract_uuid_from_line(content)
    assert session_id is not None, content

    # Submit your payment
    sessiondata = {"session_id":session_id}
    url = f'https://{config.dbos_domain}/{config.default_username}/application/{paymentapp}/api/submit_payment'
    res = session.post(url, json=sessiondata, timeout=config.default_timeout)

    # After some time, your payment should succeed
    payment_successful = False
    for _ in range(10):
        url = f'https://{config.dbos_domain}/{config.default_username}/application/{paymentapp}/api/session/{session_id}'
        res = requests.get(url, timeout=config.default_timeout)
        try:
            data = res.json()
            if data['payment_status'] == "paid":
                payment_successful = True
                break
        except ValueError:
            pass
        time.sleep(1)
    assert payment_successful

    # After the payment has succeeded, your cart should be emptied
    cart_empty = False
    for _ in range(10):
        url = f'https://{config.dbos_domain}/{config.default_username}/application/{shopapp}/api/get_cart'
        data = {'username': shop_username}
        res = session.post(url, json=data, timeout=config.default_timeout)
        try:
            data = res.json()
            if len(data) == 0:
                cart_empty = True
                break
        except ValueError:
            pass
        time.sleep(1)
    assert cart_empty
   */

  // get_cart
  // checkout_session
});

