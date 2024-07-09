import { WorkflowContext, Workflow, PostApi, HandlerContext } from '@dbos-inc/dbos-sdk';
import { FulfillUtilities, OrderPacker, OrderStatus, OrderWithProduct, Packer } from './utilities';
import { Kafka, KafkaConfig, KafkaConsume, KafkaMessage, logLevel } from '@dbos-inc/dbos-kafkajs';
export { Frontend } from './frontend';
import { CurrentTimeCommunicator } from "@dbos-inc/communicator-datetime";

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

const timeToPackOrder = 60;

export interface OrderPackerInfo
{
  packer: Packer;
  order: OrderPacker[];
  expirationSecs: number | null;
  newAssignment: boolean;
}

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

  @Workflow()
  static async userAssignmentWorkflow(ctxt: WorkflowContext, name: string) {
    let ctime = await ctxt.invoke(CurrentTimeCommunicator).getCurrentTime();
    const expiration = ctime + timeToPackOrder*1000;
    const userRec = await ctxt.invoke(FulfillUtilities).getUserAssignment(name, new Date(expiration));
    const expirationSecs = userRec.packer.expiration ? (userRec.packer.expiration!.getTime()-ctime) / 1000 : null;
    await ctxt.setEvent<OrderPackerInfo>('rec', {...userRec, expirationSecs});
      
    if (userRec.newAssignment) {
      ctxt.logger.info(`Start watch workflow for ${name}`);
      // Keep a watch over the expiration...
      let expirationMS = userRec.packer.expiration ? userRec.packer.expiration.getTime() : 0;
      while (expirationMS > ctime) {
        ctxt.logger.debug(`Sleeping ${expirationMS-ctime}`);
        await ctxt.sleepms(expirationMS - ctime);
        const curDate = await ctxt.invoke(CurrentTimeCommunicator).getCurrentDate();
        ctime = curDate.getTime();
        const nextTime = await ctxt.invoke(FulfillUtilities).checkForExpiredAssignment(name, curDate);
        if (!nextTime) {
          ctxt.logger.info(`Assignment for ${name} canceled`);
          break;
        }
        expirationMS = nextTime.getTime();
        ctxt.logger.info(`Going around again: ${expirationMS} / ${ctime}`);
      }
    }
  }

  @PostApi('/crash_application')
  static async crashApplication(_ctxt: HandlerContext) {

    // For testing and demo purposes :)
    process.exit(1);
    return Promise.resolve();
  }
}
