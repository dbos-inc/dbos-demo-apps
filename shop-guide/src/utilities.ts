import {
    Transaction, Communicator, CommunicatorContext, TransactionContext, HandlerContext, PostApi
} from '@dbos-inc/dbos-sdk';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

export const OrderStatus = {
  PENDING: 0,
  FULFILLED: 1,
  CANCELLED: -1,
};

export interface Product {
  product_id: number,
  product: string,
  description: string,
  image_name: string,
  price: number,
  inventory: number,
}

export type DisplayProduct = Omit<Product, 'inventory'> & { display_price: string };
export type CartProduct = Product & { display_price: string };

export interface Order {
  order_id: number,
  username: string,
  order_status: number,
  stripe_session_id: string,
  last_update_time: bigint,
}

export interface OrderItem {
  order_id: number,
  product_id: number,
  price: number,
  quantity: number,
}

export interface PaymentSession {
  session_id: string,
  url?: string,
  payment_status: string,
}

export const payment_complete_topic = "payment_complete";

// In this guide, we will be checking out this type of product. The database is initialized with 100000 of them.
export const product: CartProduct = {
  product_id: 1,
  product: 'a pen',
  description: 'such a stylish pen',
  image_name: 'red_pen.jpg',
  price: 1000, // an expensive pen
  inventory: 1,
  display_price: '$1000.00',
};

export function generatePaymentUrls(ctxt: HandlerContext, workflowUUID: string, paymentSessionUUID: string): string {
    const paymentUrl = ctxt.getConfig('payment_host', 'http://localhost:8086');
    return `Submit payment:\ncurl -X POST ${paymentUrl}/api/submit_payment -H "Content-type: application/json" -H "dbos-workflowuuid: ${workflowUUID}" -d '{"session_id":"${paymentSessionUUID}"}' \
    \nCancel payment:\ncurl -X POST ${paymentUrl}/api/cancel_payment -H "Content-type: application/json" -H "dbos-workflowuuid: ${workflowUUID}" -d '{"session_id":"${paymentSessionUUID}"}'\n`;
}

export class ShopUtilities {
  @Transaction()
  static async reserveInventory(ctxt: KnexTransactionContext): Promise<void> {
      const numAffected = await ctxt.client<Product>('products').where('product_id', product.product_id).andWhere('inventory', '>=', product.inventory)
      .update({
        inventory: ctxt.client.raw('inventory - ?', [product.inventory])
      });
      if (numAffected <= 0) {
        throw new Error("Insufficient Inventory");
      }
  }

  @Transaction()
  static async undoReserveInventory(ctxt: KnexTransactionContext): Promise<void> {
    await ctxt.client<Product>('products').where({ product_id: product.product_id }).update({ inventory: ctxt.client.raw('inventory + ?', [product.inventory]) });
  }

  @Communicator()
  static async createPaymentSession(ctxt: CommunicatorContext): Promise<PaymentSession> {
    return await ShopUtilities.placePaymentSessionRequest(ctxt, product);
  }

  static async placePaymentSessionRequest(ctxt: CommunicatorContext, product: Product): Promise<PaymentSession> {
    const paymentUrl = ctxt.getConfig('payment_host', 'http://localhost:8086');
    const shopUrl = ctxt.getConfig('shop_host', 'http://localhost:8082');

    const response = await fetch(`${paymentUrl}/api/create_payment_session`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: `${shopUrl}/payment_webhook`,
        success_url: `${shopUrl}/checkout/success`,
        cancel_url: `${shopUrl}/checkout/cancel`,
        client_reference_id: ctxt.workflowUUID,
        items: [{
          description: product.product,
          quantity: product.inventory,
          price: (product.price / 100).toFixed(2),
        }]
      }),
    });
    const session = await response.json() as PaymentSession;
    return session;
  }

  @Communicator()
  static async retrievePaymentSession(ctxt: CommunicatorContext, sessionID: string): Promise<PaymentSession> {
    const paymentUrl = ctxt.getConfig('payment_host', 'http://localhost:8086');
    const response = await fetch(`${paymentUrl}/api/session/${sessionID}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    const session = await response.json() as PaymentSession;
    return session;
  }

  @PostApi('/payment_webhook')
  static async paymentWebhook(ctxt: HandlerContext): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const req = ctxt.koaContext.request;

    type Session = { session_id: string; client_reference_id?: string; payment_status: string };
    const payload = req.body as Session; // eslint-disable-line @typescript-eslint/no-unsafe-member-access

    if (!payload.client_reference_id) {
      ctxt.logger.error(`Invalid payment webhook callback ${JSON.stringify(payload)}`);
    } else {
      await ctxt.send(payload.client_reference_id, payload.payment_status, payment_complete_topic);
    }
  }

}
