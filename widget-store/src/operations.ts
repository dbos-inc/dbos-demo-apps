import { WorkflowContext, Workflow, HandlerContext, PostApi, ArgOptional} from '@dbos-inc/dbos-sdk';
import { ShopUtilities, payment_complete_topic } from './utilities';
import { Frontend } from './frontend';

export { ShopUtilities };
export { Frontend };

export const session_topic = "payment_session_id";

export class Shop {
  @PostApi('/checkout/:key?')
  static async webCheckout(ctxt: HandlerContext, @ArgOptional key: string): Promise<string> {
    // Handle will be returned immediately, and the workflow will continue in the background
    const handle = await ctxt.invoke(Shop, key).paymentWorkflow();

    // This will block until the payment session is ready
    const paymentURL = await ctxt.getEvent<string>(handle.getWorkflowUUID(), session_topic);
    if (paymentURL === null) {
      ctxt.logger.error("workflow failed");
      return "/error";
    }

    return paymentURL;
  }

  @Workflow()
  static async paymentWorkflow(ctxt: WorkflowContext): Promise<void> {
    // Attempt to update the inventory. Signal the handler if it fails.
    try {
      await ctxt.invoke(ShopUtilities).subtractInventory();
    } catch (error) {
      ctxt.logger.error("Failed to update inventory");
      await ctxt.setEvent(session_topic, null);
      return;
    }

    const orderID = await ctxt.invoke(ShopUtilities).createOrder();

    // Attempt to start a payment session. If it fails, restore inventory state and signal the handler.
    const paymentURL = await ctxt.invoke(ShopUtilities).createPaymentSession();

    // Signal the handler with the payment session ID.
    await ctxt.setEvent(session_topic, paymentURL);

    // Wait for a notification from the payment service.
    const notification = await ctxt.recv<string>(payment_complete_topic, 120);

    if (notification && notification === 'paid') {
      // If the payment succeeds, fulfill the order.
      ctxt.logger.info(`Payment successful!`);
      await ctxt.invoke(ShopUtilities).fulfillOrder(orderID);
    } else {
      // Otherwise, the payment either failed or timed out. Mark the order as errored.
      ctxt.logger.warn(`Payment failed...`);
      await ctxt.invoke(ShopUtilities).errorOrder(orderID);
      await ctxt.invoke(ShopUtilities).undoSubtractInventory();
    }
  }
}

