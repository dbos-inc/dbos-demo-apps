import { WorkflowContext, Workflow, HandlerContext, PostApi } from '@dbos-inc/dbos-sdk';

import { ShopUtilities, CartProduct, checkout_complete_topic, shopUrl } from './utilities';
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
      ctxt.logger.warn("workflow cancelled");
    } else {
        ctxt.logger.info(`Checkout session ID: ${session_id}`);
    }
  }

  @Workflow()
  static async paymentWorkflow(ctxt: WorkflowContext): Promise<void> {
    // Attempt to update the inventory. Undo the order if this fails
    try {
      await ctxt.invoke(ShopUtilities).subtractInventory(product);
    } catch (error) {
        console.log(error);
      ctxt.logger.error(`Checkout for failed: insufficient inventory`);
      await ctxt.setEvent(checkout_url_topic, null);
      return;
    }

    const paymentSession = await ctxt.invoke(ShopUtilities).createPaymentSession(product);
    if (!paymentSession?.url) {
      ctxt.logger.error(`Checkout failed: couldn't create payment session`);
      await ctxt.invoke(ShopUtilities).undoSubtractInventory(product);
      await ctxt.setEvent(checkout_url_topic, null);
      return;
    }

    await ctxt.setEvent(checkout_url_topic, paymentSession.session_id);
    const notification = await ctxt.recv<string>(checkout_complete_topic, 60);

    if (notification && notification === 'paid') {
      ctxt.logger.debug(`Checkout payment notification received`);
      // if the checkout complete notification arrived, the payment is successful so fulfill the order
    } else {
      // if the checkout complete notification didn't arrive in time, retrieve the session information
      // in order to check the payment status explicitly
      ctxt.logger.warn(`Checkout: payment notification timed out`);
      const updatedSession = await ctxt.invoke(ShopUtilities).retrievePaymentSession(paymentSession.session_id);
      if (!updatedSession) {
        ctxt.logger.error(`Recovering order failed: payment service unreachable`);
      }

      if (updatedSession.payment_status === 'paid') {
        ctxt.logger.debug(`Checkout: Fetched status which was paid`);
      } else {
        ctxt.logger.error(`Checkout: payment not received`);
        await ctxt.invoke(ShopUtilities).undoSubtractInventory(product);
      }
    }
    ctxt.logger.debug(`Checkout: workflow complete`);
  }

}

