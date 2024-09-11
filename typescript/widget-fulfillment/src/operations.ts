import { WorkflowContext, Workflow, PostApi, HandlerContext, ArgOptional, configureInstance, GetApi } from '@dbos-inc/dbos-sdk';
import { FulfillUtilities, AlertEmployee, AlertStatus, AlertWithProduct, Employee } from './utilities';
import { Kafka, KafkaConfig, KafkaProduceCommunicator, Partitioners, KafkaConsume, KafkaMessage, logLevel } from '@dbos-inc/dbos-kafkajs';
export { Frontend } from './frontend';
import { CurrentTimeCommunicator } from "@dbos-inc/communicator-datetime";

const fulfillTopic = 'widget-fulfill-topic';

const kafkaConfig: KafkaConfig = {
  clientId: 'dbos-kafka-test',
  brokers: [`${process.env['KAFKA_BROKER'] ?? 'localhost:9092'}`],
  logLevel: logLevel.ERROR
};

const producerConfig: KafkaProduceCommunicator =  configureInstance(KafkaProduceCommunicator, 
  'wfKafka', kafkaConfig, fulfillTopic, {
    createPartitioner: Partitioners.DefaultPartitioner
  });

const timeToPackAlert = 30;

export interface AlertEmployeeInfo
{
  employee: Employee;
  alert: AlertEmployee[];
  expirationSecs: number | null;
  newAssignment: boolean;
}

@Kafka(kafkaConfig)
export class Fulfillment {
  @Workflow()
  @KafkaConsume(fulfillTopic)
  static async inboundAlertWorkflow(ctxt: WorkflowContext, topic: string, _partition: number, message: KafkaMessage) {
    if (topic !== fulfillTopic) return; // Error

    const payload = JSON.parse(message.value!.toString()) as {
      alert_id: string, details: AlertWithProduct[],
    };

    ctxt.logger.info(`Received alert: ${JSON.stringify(payload)}`);

    for (const detail of payload.details) {
      if (detail.alert_status !== AlertStatus.INCOMING) continue;
      await ctxt.invoke(FulfillUtilities).addAlert(detail);
    }

    return Promise.resolve();
  }

  @Workflow()
  static async userAssignmentWorkflow(ctxt: WorkflowContext, name: string, @ArgOptional more_time: boolean | undefined) {
    let ctime = await ctxt.invoke(CurrentTimeCommunicator).getCurrentTime();
    const expiration = ctime + timeToPackAlert*1000;
    const userRec = await ctxt.invoke(FulfillUtilities).getUserAssignment(name, new Date(expiration), more_time);
    const expirationSecs = userRec.employee.expiration ? (userRec.employee.expiration!.getTime()-ctime) / 1000 : null;
    await ctxt.setEvent<AlertEmployeeInfo>('rec', {...userRec, expirationSecs});
      
    if (userRec.newAssignment) {
      ctxt.logger.info(`Start watch workflow for ${name}`);
      // Keep a watch over the expiration...
      let expirationMS = userRec.employee.expiration ? userRec.employee.expiration.getTime() : 0;
      while (expirationMS > ctime) {
        ctxt.logger.debug(`Sleeping ${expirationMS-ctime}`);
        await ctxt.sleepms(expirationMS - ctime);
        const curDate = await ctxt.invoke(CurrentTimeCommunicator).getCurrentDate();
        ctime = curDate.getTime();
        const nextTime = await ctxt.invoke(FulfillUtilities).checkForExpiredAssignment(name, curDate);
        if (!nextTime) {
          ctxt.logger.info(`Assignment for ${name} ended; no longer watching.`);
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

  @PostApi('/do_send')
  @Workflow()
  static async sendAlert(ctxt: WorkflowContext, msg: string) {
      const max_id = await ctxt.invoke(FulfillUtilities).getMaxId()  
      await ctxt.invoke(producerConfig).sendMessage(
      {
        value: JSON.stringify({
          alert_id: max_id + 1,
          details: [
            { 
              alert_id: max_id+1,
              alert_status: 2,
              last_update_time: "2024-09-04",
              product: "widget"
            }
          ]
        })
      }
    );
  }

}
