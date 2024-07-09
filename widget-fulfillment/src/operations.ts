import { WorkflowContext, Workflow, PostApi, HandlerContext } from '@dbos-inc/dbos-sdk';
import { FulfillUtilities, OrderStatus, OrderWithProduct } from './utilities';
import { Kafka, KafkaConfig, KafkaConsume, KafkaMessage, logLevel } from '@dbos-inc/dbos-kafkajs';
export { Frontend } from './frontend';

const fulfillTopic = 'widget-fulfill-topic';

const kafkaConfig: KafkaConfig = {
  clientId: 'dbos-kafka-test',
  brokers: [`${process.env['KAFKA_BROKER'] ?? 'localhost:9092'}`],
  requestTimeout: 100, // FOR TESTING
  retry: { // FOR TESTING
    retries: 5
  },
  logLevel: logLevel.NOTHING, // FOR TESTING
};

@Kafka(kafkaConfig)
export class Fulfillment {
  @Workflow()
  @KafkaConsume(fulfillTopic)
  static async testWorkflow(ctxt: WorkflowContext, topic: string, _partition: number, message: KafkaMessage) {
    if (topic !== fulfillTopic) return; // Error

    const payload = JSON.parse(message.value!.toString()) as {
      order_id: string, details: OrderWithProduct[],
    };

    ctxt.logger.info(`Received order: ${JSON.stringify(payload)}`);

    for (const detail of payload.details) {
      if (detail.order_status !== OrderStatus.FULFILLED) continue;
      await ctxt.invoke(FulfillUtilities).addOrder(detail);
    }

    return Promise.resolve();
  }


  @PostApi('/crash_application')
  static async crashApplication(_ctxt: HandlerContext) {

    // For testing and demo purposes :)
    process.exit(1);
    return Promise.resolve();
  }
}
