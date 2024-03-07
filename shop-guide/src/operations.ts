import { WorkflowContext, Workflow, HandlerContext, PostApi, ArgOptional} from '@dbos-inc/dbos-sdk';
import { ShopUtilities, payment_complete_topic, generatePaymentUrls } from './utilities';
export { ShopUtilities } from './utilities'; // Required to register methods

export const session_topic = "payment_session_id";

export class Shop {
  @PostApi('/checkout/:key?')
  static async webCheckout(ctxt: HandlerContext, @ArgOptional key: string): Promise<string> {
    // A workflow handle is immediately returned. The workflow continues in the background.
    const handle = await ctxt.invoke(Shop, key).checkoutWorkflow();
    ctxt.logger.info(`Checkout workflow started with UUID: ${handle.getWorkflowUUID()}`);
  
    // Wait until the payment session is ready
    const session_id = await ctxt.getEvent<string>(handle.getWorkflowUUID(), session_topic);
    if (session_id === null) {
      ctxt.logger.error("workflow failed");
      return "";
    }
  
    return generatePaymentUrls(ctxt, handle.getWorkflowUUID(), session_id);
  }
  
  @Workflow()
  static async checkoutWorkflow(ctxt: WorkflowContext): Promise<void> {
    // Attempt to update the inventory. Signal the handler if it fails.
    try {
      await ctxt.invoke(ShopUtilities).reserveInventory();
    } catch (error) {
      ctxt.logger.error("Failed to update inventory");
      await ctxt.setEvent(session_topic, null);
      return;
    }
  
    // Attempt to start a payment session. If it fails, restore inventory state and signal the handler.
    const paymentSession = await ctxt.invoke(ShopUtilities).createPaymentSession();
    if (!paymentSession.url) {
      ctxt.logger.error("Failed to create payment session");
      await ctxt.invoke(ShopUtilities).undoReserveInventory();
      await ctxt.setEvent(session_topic, null);
      return;
    }
  
    // Notify the handler of the payment session ID.
    await ctxt.setEvent(session_topic, paymentSession.session_id);
  
    // Await a notification from the payment service.
    const notification = await ctxt.recv<string>(payment_complete_topic);
  
    if (notification && notification === 'paid') {
      // If the payment succeeds, fulfill the order (code omitted for brevity.)
      ctxt.logger.info(`Checkout with UUID ${ctxt.workflowUUID} succeeded!`);
    } else {
      // If the payment fails or times out, cancel the order and return inventory.
      ctxt.logger.warn(`Checkout with UUID ${ctxt.workflowUUID} failed or timed out...`);
      await ctxt.invoke(ShopUtilities).undoReserveInventory();
    }
  }
}

