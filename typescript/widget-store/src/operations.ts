import {
  DBOS,
  ArgOptional,
  DBOSResponseError,
} from "@dbos-inc/dbos-sdk";
import { ShopUtilities } from "./utilities";
export { Frontend } from "./frontend";

export const PAYMENT_TOPIC = "payment";
export const PAYMENT_ID_EVENT = "payment_url";
export const ORDER_ID_EVENT = "order_url";

export class Shop {
  @DBOS.postApi("/checkout/:key?")
  static async webCheckout(
    @ArgOptional key: string
  ): Promise<string | null> {
    // Start the workflow (below): this gives us the handle immediately and continues in background
    const handle = await DBOS.startWorkflow(Shop, {workflowID: key}).paymentWorkflow();

    // Wait for the workflow to create the payment ID; return that to the user
    const paymentID = await DBOS.getEvent<string | null>(
      handle.workflowID,
      PAYMENT_ID_EVENT
    );
    if (paymentID === null) {
      DBOS.logger.error("workflow failed");
    }
    return paymentID;
  }

  @DBOS.workflow()
  static async paymentWorkflow(): Promise<void> {
    // Attempt to update the inventory. Signal the handler if it fails.
    try {
      await ShopUtilities.subtractInventory();
    } catch (error) {
      DBOS.logger.error("Failed to update inventory");
      await DBOS.setEvent(PAYMENT_ID_EVENT, null);
      return;
    }
    const orderID = await ShopUtilities.createOrder();

    // Provide the paymentID back to webCheckout (above)
    await DBOS.setEvent(PAYMENT_ID_EVENT, DBOS.workflowID);

    // Wait for a payment notification from paymentWebhook (below)
    // This simulates a step waiting on a payment processor
    // If the timeout expires (seconds), this returns null
    // and the order is cancelled
    const notification = await DBOS.recv<string>(PAYMENT_TOPIC, 120);

    // If the money is good - fulfill the order. Else, cancel:
    if (notification && notification === "paid") {
      DBOS.logger.info(`Payment successful!`);
      await ShopUtilities.markOrderPaid(orderID);
    } else {
      DBOS.logger.warn(`Payment failed...`);
      await ShopUtilities.errorOrder(orderID);
      await ShopUtilities.undoSubtractInventory();
    }

    // Return the finished order ID back to paymentWebhook (below)
    await DBOS.setEvent(ORDER_ID_EVENT, orderID);
  }

  @DBOS.postApi("/payment_webhook/:key/:status")
  static async paymentWebhook(
    key: string,
    status: string
  ): Promise<string> {
    // Send payment status to the workflow above
    await DBOS.send(key, status, PAYMENT_TOPIC);

    // Wait for workflow to give us the order URL
    const orderID = await DBOS.getEvent<string>(key, ORDER_ID_EVENT);
    if (orderID === null) {
      DBOS.logger.error("retrieving order ID failed");
      throw new DBOSResponseError("Error retrieving order ID", 500);
    }

    // Return the order status URL to the client
    return orderID;
  }

  @DBOS.postApi("/crash_application")
  static async crashApplication() {
    // For testing and demo purposes :)
    process.exit(1);
    return Promise.resolve();
  }

  @DBOS.getApi("/product")
  static async product() {
    return await ShopUtilities.retrieveProduct();
  }

  @DBOS.getApi("/order/:order_id")
  static async order(order_id: number) {
    return await ShopUtilities.retrieveOrder(order_id);
  }

  @DBOS.getApi("/orders")
  static async orders() {
    return await ShopUtilities.retrieveOrders();
  }

  @DBOS.postApi("/restock")
  static async restock() {
    return await ShopUtilities.setInventory(12);
  }
}
