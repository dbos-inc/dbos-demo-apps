import express, { Request, Response, NextFunction } from "express";
import cors from 'cors';
import { initShopOperations } from "./operations";

// Wrapper for async express handlers.
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

async function startServer(port: number) {

  // initialize Operon backend
  const shopOps = await initShopOperations();

  // Create a new express application instance
  const app: express.Application = express();

  // Before the middleware because it uses custom middleware.
  app.post('/stripe_webhook', express.raw({ type: 'application/json' }), asyncHandler(async (req: Request, res: Response) => {
    const sigHeader = req.headers['stripe-signature'];
    if (typeof sigHeader !== 'string') {
      res.status(500).send();
      return;
    }
    const payload: string = (req.body as Buffer).toString();

    try {
      await shopOps.stripeWebhook(sigHeader, payload);
    } catch (err) {
      console.log(err);
      res.status(400).send(`Webhook Error`);
      return;
    }
    res.status(200).send();
    return;
  }));

  // Apply body-parsing middleware.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cors());

  app.get('/api/products', asyncHandler(async (req: Request, res: Response) => {
    const products = await shopOps.getProducts();
    res.send(products);
  }));

  app.get('/api/products/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!Number.isInteger(Number(id))) {
      res.status(400).send('Invalid product ID');
      return;
    }
    const product = await shopOps.getProduct(Number(id));
    if (product == null) {
      res.status(500).send('Error');
    } else {
      res.send(product);
    }
  }));

  app.post('/api/add_to_cart', asyncHandler(async (req: Request<unknown, unknown, { username: string, product_id: number }>, res: Response) => {
    const { username, product_id } = req.body;
    await shopOps.addToCart(username, product_id.toString());
    res.status(200).send('Success');
  }));

  app.post('/api/get_cart', asyncHandler(async (req: Request<unknown, unknown, { username: string }>, res: Response) => {
    const { username } = req.body;
    const productDetails = await shopOps.getCart(username);
    res.send(productDetails);
  }));

  // this API method is not currently used
  // app.post('/api/clear_cart', asyncHandler(async (req: Request, res: Response) => {
  //     const { username } = req.body;
  //     const productDetails = await operon.transaction(clearCart, {}, username);
  //     res.send(productDetails);
  // }));

  app.post('/api/checkout_session', asyncHandler(async (req: Request, res: Response) => {
    const username = req.query.username;
    const origin = req.headers.origin;
    if (typeof username !== 'string' || typeof origin !== 'string') {
      res.status(400).send("Invalid request");
      return;
    }
    const url = await shopOps.runPaymentWorkflow(username, origin);
    if (url === null) {
      res.redirect(303, `${origin}/checkout/cancel`);
    } else {
      res.redirect(303, url);
    }
  }));

  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
}

const port: number = 8082;
void startServer(port);