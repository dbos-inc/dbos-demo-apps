// Widget Store

// This app uses DBOS to build an online storefront that's resilient to any failure.
// The focus of this app is on the checkout workflow, which durably manages order status,
// product inventory, and payment to ensure every checkout completes correctly.

import Fastify from 'fastify';
import { DBOS } from '@dbos-inc/dbos-sdk';
import {
  retrieveOrders,
  subtractInventory,
  createOrder,
  markOrderPaid,
  dispatchOrder,
  errorOrder,
  undoSubtractInventory,
  retrieveProduct,
  retrieveOrder,
  setInventory,
} from './utilities';
import { Liquid } from 'liquidjs';
import path from 'path';

export const PAYMENT_TOPIC = 'payment';
export const PAYMENT_ID_EVENT = 'payment_url';
export const ORDER_ID_EVENT = 'order_url';

// First, let's write the checkout workflow.
// This workflow is triggered whenever a customer buys a widget.
// It creates a new order, then reserves inventory, then processes payment,
// then marks the order as paid. If any step fails, the workflow backs out,
// returning reserved inventory and marking the order as cancelled.

// DBOS durably executes this workflow: each of its steps executes exactly once and
// if it's ever interrupted, it automatically resumes from where it left off.
// You can try this yourself--start an order and press the crash button at any time.
// Within seconds, your app will recover to exactly the state it was in before the crash
// and continue as if nothing happened.

const checkoutWorkflow = DBOS.registerWorkflow(async () => {
  // Attempt to reserve inventory, failing if no inventory remains
  try {
    await subtractInventory();
  } catch (error) {
    DBOS.logger.error(`Failed to update inventory: ${(error as Error).message}`);
    await DBOS.setEvent(PAYMENT_ID_EVENT, null);
    return;
  }

  // Create a new order
  const orderID = await createOrder();

  // Send a unique payment ID to the checkout endpoint so it can
  // redirect the customer to the payments page
  await DBOS.setEvent(PAYMENT_ID_EVENT, DBOS.workflowID);
  const notification = await DBOS.recv<string>(PAYMENT_TOPIC, 120);

  // If payment succeeded, mark the order as paid and start the order dispatch workflow.
  // Otherwise, return reserved inventory and cancel the order.
  if (notification && notification === 'paid') {
    DBOS.logger.info(`Payment successful!`);
    await markOrderPaid(orderID);
    await DBOS.startWorkflow(dispatchOrder)(orderID);
  } else {
    DBOS.logger.warn(`Payment failed...`);
    await errorOrder(orderID);
    await undoSubtractInventory();
  }

  // Finally, send the order ID to the payment endpoint so it can redirect
  // the customer to the order status page.
  await DBOS.setEvent(ORDER_ID_EVENT, orderID);
}, {"name": "checkoutWorkflow"});

// Now, let's use Fastify to write the HTTP endpoint for checkout.

// This endpoint receives a request when a customer presses the "Buy Now" button.
// It starts the checkout workflow in the background, then waits for the workflow
// to generate and send it a unique payment ID. It then returns the payment ID
// so the browser can redirect the customer to the payments page.

// The endpoint accepts an idempotency key so that even if the customer presses
// "buy now" multiple times, only one checkout workflow is started.

const fastify = Fastify({ logger: true });

fastify.post<{
  Params: { key: string };
}>('/checkout/:key', async (req, reply) => {
  const key = req.params.key;
  // Idempotently start the checkout workflow in the background.
  const handle = await DBOS.startWorkflow(checkoutWorkflow, { workflowID: key })();
  // Wait for the checkout workflow to send a payment ID, then return it.
  const paymentID = await DBOS.getEvent<string | null>(handle.workflowID, PAYMENT_ID_EVENT);
  if (paymentID === null) {
    DBOS.logger.error('checkout failed');
    return reply.code(500).send('Error starting checkout');
  }
  return paymentID;
});

// This is the HTTP endpoint for payments. It uses the payment ID to signal
// the checkout workflow whether the payment succeeded or failed.
// It then retrieves the order ID from the checkout workflow
// so the browser can redirect the customer to the order status page.

fastify.post<{
  Params: { key: string; status: string };
}>('/payment_webhook/:key/:status', async (req, reply) => {
  const { key, status } = req.params;
  // Send the payment status to the checkout workflow.
  await DBOS.send(key, status, PAYMENT_TOPIC);
  // Wait for the checkout workflow to send an order ID, then return it.
  const orderID = await DBOS.getEvent<string>(key, ORDER_ID_EVENT);
  if (orderID === null) {
    DBOS.logger.error('retrieving order ID failed');
    return reply.code(500).send('Error retrieving order ID');
  }
  return orderID;
});

// These HTTP endpoints call database CRUD operations to retrieve and update
// order and product information.

fastify.get('/product', async () => {
  return await retrieveProduct();
});

fastify.get<{
  Params: { order_id: string };
}>('/order/:order_id', async (req) => {
  const order_id = Number(req.params.order_id);
  return await retrieveOrder(order_id);
});

fastify.get('/orders', async () => {
  return await retrieveOrders();
});

fastify.post('/restock', async () => {
  return await setInventory(100);
});

// Let's serve the app's frontend from an HTML file using Fastify.

fastify.get('/', async (req, reply) => {
  async function render(file: string, ctx?: object): Promise<string> {
    const engine = new Liquid({
      root: path.resolve(__dirname, '..', 'public'),
    });
    return (await engine.renderFile(file, ctx)) as string;
  }
  const html = await render('app.html', {});
  return reply.type('text/html').send(html);
});

// Here is the crash endpoint. It crashes your app. For demonstration purposes only. :)

fastify.post('/crash_application', () => {
  process.exit(1);
});

async function main() {
  const PORT = parseInt(process.env.NODE_PORT || '3000');
  DBOS.setConfig({
    name: 'widget-store-node',
    databaseUrl: process.env.DBOS_DATABASE_URL,
  });
  DBOS.logRegisteredEndpoints();
  await DBOS.launch({"conductorKey": process.env.CONDUCTOR_KEY});
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
}

main().catch(console.log);
