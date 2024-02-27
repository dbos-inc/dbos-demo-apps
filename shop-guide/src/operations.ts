import { WorkflowContext, Workflow, HandlerContext, PostApi } from '@dbos-inc/dbos-sdk';

import { ShopUtilities, CartProduct, checkout_complete_topic, printPaymentUrls } from './utilities';
export { ShopUtilities } from './utilities'; // Required to register methods

export const checkout_url_topic = "payment_checkout_url";

const product: CartProduct = {
  product_id: 1,
  product: 'a pen',
  description: 'such a stylish pen',
  image_name: 'red_pen.jpg',
  price: 1000, // an expensive pen
  inventory: 10,
  display_price: '$100.00',
};

export class Shop {

  @PostApi('/api/checkout_session')
  static async webCheckout(ctxt: HandlerContext): Promise<void> {
    // Handle will be returned immediately, and the workflow will continue in the background
    const handle = await ctxt.invoke(Shop).paymentWorkflow();
    ctxt.logger.info(`Checkout workflow started with UUID: ${handle.getWorkflowUUID()}`);

    // This will block until the payment session is ready
    const session_id = await ctxt.getEvent<string>(handle.getWorkflowUUID(), checkout_url_topic);
    if (session_id === null) {
      ctxt.logger.error("workflow failed");
      return;
    }

    printPaymentUrls(ctxt, handle.getWorkflowUUID(), session_id);
  }

  @Workflow()
  static async paymentWorkflow(ctxt: WorkflowContext): Promise<void> {
    // Attempt to update the inventory. Signal the handler if it fails.
    try {
      await ctxt.invoke(ShopUtilities).subtractInventory(product);
    } catch (error) {
      ctxt.logger.error(`Checkout failed: unable to update inventory`);
      await ctxt.setEvent(checkout_url_topic, null);
      return;
    }

    // Attempt to start a payment session. If it fails, restore inventory state and signal the handler.
    const paymentSession = await ctxt.invoke(ShopUtilities).createPaymentSession(product);
    if (!paymentSession?.url) {
      ctxt.logger.error(`Checkout failed: couldn't create payment session`);
      await ctxt.invoke(ShopUtilities).undoSubtractInventory(product);
      await ctxt.setEvent(checkout_url_topic, null);
      return;
    }

    // Signal the handler with the payment session ID.
    await ctxt.setEvent(checkout_url_topic, paymentSession.session_id);

    // Wait for a notification from the payment service.
    const notification = await ctxt.recv<string>(checkout_complete_topic, 30);

    if (notification && notification === 'paid') {
      // if the checkout complete notification arrived.
      ctxt.logger.info(`Checkout payment notification received`);
    } else {
      // Otherwise, either the payment failed or the notification timed out.
      ctxt.logger.warn(`Checkout payment failed or timed out`);
    }
  }
}

