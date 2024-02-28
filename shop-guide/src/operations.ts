import { WorkflowContext, Workflow, HandlerContext, PostApi, ArgOptional} from '@dbos-inc/dbos-sdk';
import { ShopUtilities, checkout_complete_topic, generatePaymentUrls, product } from './utilities';
export { ShopUtilities } from './utilities'; // Required to register methods

export const checkout_url_topic = "payment_checkout_url";

export class Shop {
  @PostApi('/checkout/:uuid?')
  static async webCheckout(ctxt: HandlerContext, @ArgOptional uuid: string): Promise<string> {
    // Handle will be returned immediately, and the workflow will continue in the background
    const handle = await ctxt.invoke(Shop, uuid).paymentWorkflow();
    ctxt.logger.info(`Checkout workflow started with UUID: ${handle.getWorkflowUUID()}`);

    // This will block until the payment session is ready
    const session_id = await ctxt.getEvent<string>(handle.getWorkflowUUID(), checkout_url_topic);
    if (session_id === null) {
      ctxt.logger.error("workflow failed");
      return "";
    }

    return generatePaymentUrls(ctxt, handle.getWorkflowUUID(), session_id);
  }

  @Workflow()
  static async paymentWorkflow(ctxt: WorkflowContext): Promise<void> {
    // Attempt to update the inventory. Signal the handler if it fails.
    try {
      await ctxt.invoke(ShopUtilities).subtractInventory();
    } catch (error) {
      ctxt.logger.error("Failed to update inventory");
      await ctxt.setEvent(checkout_url_topic, null);
      return;
    }

    // Attempt to start a payment session. If it fails, restore inventory state and signal the handler.
    const paymentSession = await ctxt.invoke(ShopUtilities).createPaymentSession();
    if (!paymentSession?.url) {
      ctxt.logger.error("Failed to create payment session");
      await ctxt.invoke(ShopUtilities).undoSubtractInventory(product);
      await ctxt.setEvent(checkout_url_topic, null);
      return;
    }

    // Signal the handler with the payment session ID.
    await ctxt.setEvent(checkout_url_topic, paymentSession.session_id);

    // Wait for a notification from the payment service.
    const notification = await ctxt.recv<string>(checkout_complete_topic, 30);
    console.log(notification);

    if (notification && notification === 'paid') {
      // If the payment succeeds, fulfill the order (code omitted for clarity.)
      ctxt.logger.info(`Payment notification received`);
    } else {
      // Otherwise, either the payment failed or timed out.
      // Code to check the latest session status with the payment service omitted for clarity.
      ctxt.logger.warn(`Payment failed or timed out`);
      await ctxt.invoke(ShopUtilities).undoSubtractInventory(product);
    }
  }
}

