import express, { Request, Response, NextFunction } from "express";
import { TransactionContext, WorkflowContext, Operon, CommunicatorContext } from 'operon';
import cors from 'cors';
import Stripe from 'stripe';
import { v1 as uuidv1 } from 'uuid';

const port: number = 8082;
const stripe = new Stripe(process.env.STRIPE_API_KEY || 'error_no_stripe_key', {
  apiVersion: '2022-11-15',
});
const endpointSecret: string = process.env.STRIPE_WEBHOOK_SECRET || 'error_no_webhook_secret';

const OrderStatus = {
  PENDING: 0,
  FULFILLED: 1,
  CANCELLED: -1,
};

interface Product {
  product_id: number,
  product: string,
  description: string,
  image_name: string,
  price: number,
  inventory: number,
}

// Wrapper for async express handlers.
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Create an Operon.
const operon: Operon = new Operon({
  user: 'shop',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: 'shop',
  password: 'shop',
  port: 5432,
});

// Create a new express application instance
const app: express.Application = express();

// Before the middleware because it uses custom middleware.
app.post('/stripe_webhook', express.raw({type: 'application/json'}), asyncHandler(async (req: Request, res: Response) => {
  const sigHeader = req.headers['stripe-signature'];
  const payload: string = (req.body as Buffer).toString();
  if (typeof sigHeader !== 'string') {
    res.status(500).send();
    return;
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, sigHeader, endpointSecret);
  } catch (err) {
    console.log(err);
    res.status(400).send(`Webhook Error`);
    return;
  }
  if (event.type === 'checkout.session.completed') {
    const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Response<Stripe.Checkout.Session>).id);
    if (session.client_reference_id !== null) {
      const orderID: string = session.client_reference_id;
      await operon.send({}, "stripe_payments" + orderID, "checkout.session.completed");
    }
  }
  res.status(200).send();
  return;
}));

// Apply body-parsing middleware.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

async function getProducts(ctxt: TransactionContext) {
  const { rows } = await ctxt.client.query<Product>('SELECT product_id, product, description, image_name, price FROM products');
  const formattedRows = rows.map((row) => ({
    ...row,
    display_price: (row.price / 100).toFixed(2),
  }));

  return formattedRows;
}

app.get('/api/products', asyncHandler(async (req: Request, res: Response) => {
  const products = await operon.transaction(getProducts, {});
  res.send(products);
}));

async function getProduct(ctxt: TransactionContext, id: number) {
  const { rows } = await ctxt.client.query<Product>(`SELECT product_id, product, description, image_name, price FROM products WHERE product_id = $1`, [id]);
  if (rows.length === 0) {
    return null;
  }
  const product = {
    ...rows[0],
    display_price: (rows[0].price / 100).toFixed(2),
  };
  return product;
}

app.get('/api/products/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!Number.isInteger(Number(id))) {
    res.status(400).send('Invalid product ID');
    return;
  }
  const product = await operon.transaction(getProduct, {}, Number(id));
  if (product == null) {
    res.status(500).send('Error');
  } else {
    res.send(product);
  }
}));

async function addToCart(ctxt: TransactionContext, username: string, product_id: string) {
  await ctxt.client.query(`INSERT INTO cart VALUES($1, $2, 1) ON CONFLICT (username, product_id) DO UPDATE SET quantity = cart.quantity + 1`, [username, product_id]);
}

app.post('/api/add_to_cart', asyncHandler(async (req: Request, res: Response) => {
  const {username, product_id} = req.body;
  await operon.transaction(addToCart, {}, username, product_id);
  res.status(200).send('Success');
}));

async function getCart(ctxt: TransactionContext, username: string) {
  const { rows } = await ctxt.client.query(`SELECT product_id, quantity FROM cart WHERE username=$1`, [username]);
  const productDetails = await Promise.all(rows.map(async (row) => ({
    ...(await getProduct(ctxt, row.product_id))!,
    inventory: row.quantity,
  })));
  return productDetails;
}

app.post('/api/get_cart', asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.body;
  const productDetails = await operon.transaction(getCart, {}, username);
  res.send(productDetails);
}));

async function subtractInventory(ctxt: TransactionContext, products: Product[]): Promise<boolean> {
  let hasEnoughInventory = true;
  for (const product of products) {
    const { rows } = await ctxt.client.query<Product>(`SELECT inventory FROM products WHERE product_id = $1`, [product.product_id]);
    const currentInventory = rows[0]?.inventory;

    if (currentInventory < product.inventory) {
      hasEnoughInventory = false;
      break;
    }
  }
  if (hasEnoughInventory) {
    // If all products have enough inventory, subtract the inventory from the products in the database
    for (const product of products) {
      await ctxt.client.query(`UPDATE products SET inventory = inventory - $1 WHERE product_id = $2`, [product.inventory, product.product_id]);
    }
  }
  return hasEnoughInventory;
}

async function undoSubtractInventory(ctxt: TransactionContext, products: Product[]) {
  for (const product of products) {
    await ctxt.client.query(`UPDATE products SET inventory = inventory + $1 WHERE product_id = $2`, [product.inventory, product.product_id]);
  }
}

async function createOrder(ctxt: TransactionContext, username: string, productDetails: Product[]) {
  const { rows } = await ctxt.client.query(`INSERT INTO orders(username, order_status, last_update_time) VALUES ($1, $2, $3) RETURNING order_id`, 
    [username, OrderStatus.PENDING, 0]);
  const orderID : number = rows[0].order_id;
  for (const product of productDetails) {
    await ctxt.client.query(`INSERT INTO order_items(order_id, product_id, price, quantity) VALUES($1, $2, $3, $4)`, 
      [orderID, product.product_id, product.price, product.inventory]);
  }
  return orderID;
}

async function fulfillOrder(ctxt: TransactionContext, orderID: number) {
  await ctxt.client.query(`UPDATE orders SET order_status=$1 WHERE order_id=$2`, [OrderStatus.FULFILLED, orderID]);
}

async function clearCart(ctxt: TransactionContext, orderID: number) {
  const { rows } = await ctxt.client.query(`SELECT username FROM orders WHERE order_id=$1`, [orderID]);
  const username: string = rows[0].username;
  await ctxt.client.query(`DELETE FROM cart WHERE username=$1`, [username]);
}

async function errorOrder(ctxt: TransactionContext, orderID: number) {
  await ctxt.client.query(`UPDATE orders SET order_status=$1 WHERE order_id=$2`, [OrderStatus.CANCELLED, orderID]);
}

async function createStripeSession(ctxt: CommunicatorContext, orderID: number, productDetails: Product[], origin: string) {
  const lineItems = productDetails.map((item) => ({
    quantity: item.inventory,
    price_data: {
      currency: "usd",
      unit_amount: item.price,
      product_data: {
        name: item.product,
      }
    }
  }));
  const session: Stripe.Response<Stripe.Checkout.Session> = await stripe.checkout.sessions.create({
    line_items: lineItems,
    mode: 'payment',
    client_reference_id: String(orderID),
    success_url: `${origin}/checkout/success`,
    cancel_url: `${origin}/checkout/cancel`,
  });
  return session;
}

async function retrieveStripeSession(ctxt: CommunicatorContext, sessionID: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionID);
  try {
    await stripe.checkout.sessions.expire(sessionID); // Ensure nothing changes in the session.
  } catch(err) {
    // Session was already expired.
  }
  return session;
}

async function paymentWorkflow(ctxt: WorkflowContext, username: string, origin: string, uuid: string) {
  const productDetails: Product[] = await ctxt.transaction(getCart, username);
  const orderID: number = await ctxt.transaction(createOrder, username, productDetails);
  const valid: boolean = await ctxt.transaction(subtractInventory, productDetails);
  if (!valid) {
    await ctxt.send(uuid, null);
    return;
  }
  const stripeSession = await ctxt.external(createStripeSession, {}, orderID, productDetails, origin);
  if (stripeSession === null || stripeSession.url === null) {
    await ctxt.transaction(undoSubtractInventory, productDetails);
    await ctxt.send(uuid, null);
    return;
  }
  await ctxt.send(uuid, stripeSession.url);
  const notification = await ctxt.recv<string | null>("stripe_payments" + orderID.toString(), 60);
  if (notification !== null) {
    await ctxt.transaction(fulfillOrder, orderID);
    await ctxt.transaction(clearCart, orderID);
  } else {
    const updatedSession = await ctxt.external(retrieveStripeSession, {}, stripeSession.id);
    if (updatedSession === null) {
      console.error(`Recovering order #${orderID} failed: Stripe unreachable`);
      return;
    }
    const paymentStatus: string = updatedSession.payment_status;
    if (paymentStatus == 'paid') {
      await ctxt.transaction(fulfillOrder, orderID);
      await ctxt.transaction(clearCart, orderID);
    } else if (paymentStatus == 'unpaid') {
      await ctxt.transaction(undoSubtractInventory, productDetails);
      await ctxt.transaction(errorOrder, orderID);
    } else {
      console.error(`Unrecognized payment status: ${paymentStatus}`);
    }
  }
}

app.post('/api/checkout_session', asyncHandler(async (req: Request, res: Response) => {
  const username = req.query.username;
  const origin = req.headers.origin;
  if (typeof username !== 'string' || typeof origin !== 'string'){
    res.status(400).send("Invalid request");
    return;
  }
  const uuid: string = uuidv1();
  void operon.workflow(paymentWorkflow, {}, username, origin, uuid);
  const url = await operon.recv<string | null>({}, uuid, 10);
  if (url === null) {
    res.redirect(303, `${origin}/checkout/cancel`);
  } else {
    res.redirect(303, url)
  }
}));


async function startServer() {
  await operon.resetOperonTables();
  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
  
}
  
void startServer();