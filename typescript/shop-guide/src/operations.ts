import { DBOS, ArgOptional} from '@dbos-inc/dbos-sdk';
import { ShopUtilities, payment_complete_topic, generatePaymentUrls } from './utilities';

export const session_topic = "payment_session_id";

export class Shop {
  @DBOS.postApi('/checkout/:key?')
  static async webCheckout(@ArgOptional key: string): Promise<string> {
    // A workflow handle is immediately returned. The workflow continues in the background.
    const handle = await DBOS.startWorkflow(Shop, {workflowID: key}).checkoutWorkflow();
    DBOS.logger.info(`Checkout workflow started with UUID: ${handle.getWorkflowUUID()}`);
  
    // Wait until the payment session is ready
    const session_id = await DBOS.getEvent<string>(handle.getWorkflowUUID(), session_topic);
    if (session_id === null) {
      DBOS.logger.error("workflow failed");
      return "";
    }
    return generatePaymentUrls(handle.getWorkflowUUID(), session_id);
  }

  @DBOS.workflow()
  static async checkoutWorkflow(): Promise<void> {
    // Attempt to update the inventory. Signal the handler if it fails.
    try {
      await ShopUtilities.reserveInventory();
    } catch (error) {
      DBOS.logger.error("Failed to update inventory");
      await DBOS.setEvent(session_topic, null);
      return;
    }

    // Attempt to start a payment session. If it fails, restore inventory state and signal the handler.
    const paymentSession = await ShopUtilities.createPaymentSession();
    if (!paymentSession.url) {
      DBOS.logger.error("Failed to create payment session");
      await DBOS.invoke(ShopUtilities).undoReserveInventory();
      await DBOS.setEvent(session_topic, null);
      return;
    }

    // Notify the handler of the payment session ID.
    await DBOS.setEvent(session_topic, paymentSession.session_id);
  
    // Await a notification from the payment service.
    const notification = await DBOS.recv<string>(payment_complete_topic);
  
    if (notification && notification === 'paid') {
      // If the payment succeeds, fulfill the order (code omitted for brevity.)
      DBOS.logger.info(`Checkout with UUID ${DBOS.workflowID} succeeded!`);
    } else {
      // If the payment fails or times out, cancel the order and return inventory.
      // Code to check session status with payment provider in case of timeout omitted for brevity.
      DBOS.logger.warn(`Checkout with UUID ${DBOS.workflowID} failed or timed out...`);
      await DBOS.invoke(ShopUtilities).undoReserveInventory();
    }
  }
}

