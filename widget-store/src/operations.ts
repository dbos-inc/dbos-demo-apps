import { WorkflowContext, Workflow, HandlerContext, PostApi, ArgOptional, configureInstance } from '@dbos-inc/dbos-sdk';
import { ShopUtilities } from './utilities';
import { KafkaConfig, KafkaProduceCommunicator, Partitioners, logLevel } from '@dbos-inc/dbos-kafkajs';
export { Frontend } from './frontend';

export const PAYMENT_TOPIC = "payment";
export const PAYMENT_URL_EVENT = "payment_url";
export const ORDER_URL_EVENT = "order_url";

// These tests require local Kafka to run.
// Without it, they're automatically skipped.
// Here's a docker-compose script you can use to set up local Kafka:
// eslint-disable-next-line no-secrets/no-secrets
const _ = `
version: "3.7"
services:
  broker:
      image: bitnami/kafka:latest
      hostname: broker
      container_name: broker
      ports:
        - '9092:9092'
        - '29093:29093'
        - '19092:19092'
      environment:
        KAFKA_CFG_NODE_ID: 1
        KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'
        KAFKA_CFG_ADVERTISED_LISTENERS: 'PLAINTEXT_HOST://localhost:9092,PLAINTEXT://broker:19092'
        KAFKA_CFG_PROCESS_ROLES: 'broker,controller'
        KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: '1@broker:29093'
        KAFKA_CFG_LISTENERS: 'CONTROLLER://:29093,PLAINTEXT_HOST://:9092,PLAINTEXT://:19092'
        KAFKA_CFG_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
        KAFKA_CFG_CONTROLLER_LISTENER_NAMES: 'CONTROLLER'
`;

const kafkaConfig: KafkaConfig = {
  clientId: 'dbos-kafka-test',
  brokers: [`${process.env['KAFKA_BROKER'] ?? 'localhost:9092'}`],
  requestTimeout: 100, // FOR TESTING
  retry: { // FOR TESTING
    retries: 5
  },
  logLevel: logLevel.NOTHING, // FOR TESTING
};

const fulfillTopic = 'widget-fulfill-topic';

const fulfillKafkaCfg: KafkaProduceCommunicator | undefined = process.env['KAFKA_BROKER']
  ? configureInstance(KafkaProduceCommunicator, 'wfKafka', kafkaConfig, fulfillTopic, {
    createPartitioner: Partitioners.DefaultPartitioner
  })
  : undefined;

export class Shop {

  @PostApi('/checkout/:key?')
  static async webCheckout(ctxt: HandlerContext, @ArgOptional key: string): Promise<string> {
    // Start the workflow (below): this gives us the handle immediately and continues in background
    const handle = await ctxt.startWorkflow(Shop, key).paymentWorkflow();

    // Wait for the workflow to create the payment URL; return that to the user
    const paymentURL = await ctxt.getEvent<string>(handle.getWorkflowUUID(), PAYMENT_URL_EVENT);
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
      await ctxt.setEvent(PAYMENT_URL_EVENT, null);
      return;
    }
    const orderID = await ctxt.invoke(ShopUtilities).createOrder();

    // Provide the paymentURL back to webCheckout (above)
    await ctxt.setEvent(PAYMENT_URL_EVENT, `/payment/${ctxt.workflowUUID}`);

    // Wait for a payment notification from paymentWebhook (below)
    // This simulates a communicator waiting on a payment processor
    // If the timeout expires (seconds), this returns null
    // and the order is cancelled
    const notification = await ctxt.recv<string>(PAYMENT_TOPIC, 120);

    // If the money is good - fulfill the order. Else, cancel:
    if (notification && notification === 'paid') {
      ctxt.logger.info(`Payment successful!`);
      if (fulfillKafkaCfg) {
        ctxt.logger.info(`Notify fulfillment department.`);
        await ctxt.invoke(ShopUtilities).markOrderPaid(orderID);
        await ctxt.invoke(fulfillKafkaCfg).sendMessage(
          {
            value: JSON.stringify({
              order_id: orderID,
              details: await ctxt.invoke(ShopUtilities).retrieveOrderDetails(orderID),
            })
          }
        );
      }
      await ctxt.invoke(ShopUtilities).fulfillOrder(orderID);
    } else {
      ctxt.logger.warn(`Payment failed...`);
      await ctxt.invoke(ShopUtilities).errorOrder(orderID);
      await ctxt.invoke(ShopUtilities).undoSubtractInventory();
    }

    // Return the finished order ID back to paymentWebhook (below)
    await ctxt.setEvent(ORDER_URL_EVENT, `/order/${orderID}`);
  }

  @PostApi('/payment_webhook/:key/:status')
  static async paymentWebhook(ctxt: HandlerContext, key: string, status: string): Promise<string> {

    // Send payment status to the workflow above
    await ctxt.send(key, status, PAYMENT_TOPIC);

    // Wait for workflow to give us the order URL
    const orderURL = await ctxt.getEvent<string>(key, ORDER_URL_EVENT);
    if (orderURL === null) {
      ctxt.logger.error("retreving order URL failed");
      return "/error";
    }

    // Return the order status URL to the client
    return orderURL;
  }

  @PostApi('/crash_application')
  static async crashApplication(_ctxt: HandlerContext) {

    // For testing and demo purposes :)
    process.exit(1);
    return Promise.resolve();
  }
}
