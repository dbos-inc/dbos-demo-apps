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

const localHost = 'http://localhost:8082';
const paymentHost = 'localhost:8086';

export const checkout_complete_topic = "payment_checkout_complete";

export class ShopUtilities {
  @Transaction()
  static async createOrder(ctxt: KnexTransactionContext, username: string, product: CartProduct): Promise<number> {
    const orders = await ctxt.client<Order>('orders').insert({ username, order_status: OrderStatus.PENDING, last_update_time: 0n }).returning('order_id');
    const orderID = orders[0].order_id;

    await ctxt.client<OrderItem>('order_items').insert({ order_id: orderID, product_id: product.product_id, price: product.price, quantity: product.inventory });

    return orderID;
  }

  @Transaction()
  static async subtractInventory(ctxt: KnexTransactionContext, product: Product): Promise<void> {
      const numAffected = await ctxt.client<Product>('products').where('product_id', product.product_id).andWhere('inventory', '>=', product.inventory)
      .update({
        inventory: ctxt.client.raw('inventory - ?', [product.inventory])
      });
      if (numAffected <= 0) {
        throw new Error("Insufficient Inventory");
      }
  }

  @Transaction()
  static async undoSubtractInventory(ctxt: KnexTransactionContext, product: Product): Promise<void> {
    await ctxt.client<Product>('products').where({ product_id: product.product_id }).update({ inventory: ctxt.client.raw('inventory + ?', [product.inventory]) });
  }

  @Transaction()
  static async fulfillOrder(ctxt: KnexTransactionContext, orderID: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.FULFILLED });
  }

  @Transaction()
  static async errorOrder(ctxt: KnexTransactionContext, orderID: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.CANCELLED });
  }

  @Communicator()
  static async createPaymentSession(ctxt: CommunicatorContext, productDetail: Product, origin: string): Promise<PaymentSession> {
    return await ShopUtilities.placePaymentSessionRequest(ctxt, productDetail, origin);
  }

  static async placePaymentSessionRequest(ctxt: CommunicatorContext, product: Product): Promise<PaymentSession> {
    const response = await fetch(`${paymentHost}/api/create_payment_session`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: `${localHost}/payment_webhook`,
        success_url: `${localHost}/checkout/success`,
        cancel_url: `${localHost}/checkout/cancel`,
        client_reference_id: ctxt.workflowUUID,
        items: {
          description: product.product,
          quantity: product.inventory,
          price: (product.price / 100).toFixed(2),
        }
      }),
    });
    const session = await response.json() as PaymentSession;
    return session;
  }

  @Communicator()
  static async retrievePaymentSession(_ctxt: CommunicatorContext, sessionID: string): Promise<PaymentSession> {
    const response = await fetch(`${paymentHost}/api/session/${sessionID}`, {
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
    const req = ctxt.koaContext.request;

    type Session = { session_id: string; client_reference_id?: string; payment_status: string };
    const payload = req.body as Session;

    if (!payload.client_reference_id) {
      ctxt.logger.error(`Invalid payment webhook callback ${JSON.stringify(payload)}`);
    } else {
      await ctxt.send(payload.client_reference_id, payload.payment_status, checkout_complete_topic);
    }
  }

}
