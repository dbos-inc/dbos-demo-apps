import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { DBOS, DBOSResponseError } from '@dbos-inc/dbos-sdk';
import { ShopUtilities } from './utilities';
import { Liquid } from 'liquidjs';
import path from 'path';

export const PAYMENT_TOPIC = 'payment';
export const PAYMENT_ID_EVENT = 'payment_url';
export const ORDER_ID_EVENT = 'order_url';

export class Shop {
  @DBOS.workflow()
  static async paymentWorkflow(): Promise<void> {
    try {
      await ShopUtilities.subtractInventory();
    } catch (error) {
      DBOS.logger.error(`Failed to update inventory: ${(error as Error).message}`);
      await DBOS.setEvent(PAYMENT_ID_EVENT, null);
      return;
    }
    const orderID = await ShopUtilities.createOrder();
    await DBOS.setEvent(PAYMENT_ID_EVENT, DBOS.workflowID);
    const notification = await DBOS.recv<string>(PAYMENT_TOPIC, 120);

    if (notification && notification === 'paid') {
      DBOS.logger.info(`Payment successful!`);
      await ShopUtilities.markOrderPaid(orderID);
      await DBOS.startWorkflow(ShopUtilities).dispatchOrder(orderID);
    } else {
      DBOS.logger.warn(`Payment failed...`);
      await ShopUtilities.errorOrder(orderID);
      await ShopUtilities.undoSubtractInventory();
    }

    await DBOS.setEvent(ORDER_ID_EVENT, orderID);
  }
}

const fastify: FastifyInstance = Fastify();

fastify.post<{
  Params: { key: string };
}>('/checkout/:key', async (req: FastifyRequest<{ Params: { key: string } }>) => {
  const key = req.params.key;
  const handle = await DBOS.startWorkflow(Shop, { workflowID: key }).paymentWorkflow();
  const paymentID = await DBOS.getEvent<string | null>(handle.workflowID, PAYMENT_ID_EVENT);
  if (paymentID === null) DBOS.logger.error('workflow failed');
  return paymentID;
});

fastify.post<{
  Params: { key: string; status: string };
}>('/payment_webhook/:key/:status', async (req: FastifyRequest<{ Params: { key: string; status: string } }>) => {
  const { key, status } = req.params;
  await DBOS.send(key, status, PAYMENT_TOPIC);
  const orderID = await DBOS.getEvent<string>(key, ORDER_ID_EVENT);
  if (orderID === null) {
    DBOS.logger.error('retrieving order ID failed');
    throw new DBOSResponseError('Error retrieving order ID', 500);
  }
  return orderID;
});

fastify.post('/crash_application', () => {
  process.exit(1);
});

fastify.get('/product', async () => {
  return await ShopUtilities.retrieveProduct();
});

fastify.get<{
  Params: { order_id: string };
}>('/order/:order_id', async (req: FastifyRequest<{ Params: { order_id: string } }>) => {
  const order_id = Number(req.params.order_id);
  return await ShopUtilities.retrieveOrder(order_id);
});

fastify.get('/orders', async () => {
  return await ShopUtilities.retrieveOrders();
});

fastify.post('/restock', async () => {
  return await ShopUtilities.setInventory(12);
});

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

async function main() {
  const PORT = 3000;
  DBOS.setConfig({
    name: 'widget-store',
    databaseUrl: process.env.DBOS_DATABASE_URL,
  });
  await DBOS.launch();
  await fastify.listen({ port: PORT });
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
}

main().catch(console.log);
