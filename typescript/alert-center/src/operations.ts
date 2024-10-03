import { WorkflowContext, Workflow, PostApi, HandlerContext, ArgOptional, configureInstance } from '@dbos-inc/dbos-sdk';
import { RespondUtilities, AlertEmployee, AlertStatus, AlertWithMessage, Employee } from './utilities';
import { Kafka, KafkaConfig, KafkaProduceCommunicator, Partitioners, KafkaConsume, KafkaMessage, logLevel } from '@dbos-inc/dbos-kafkajs';
export { Frontend } from './frontend';
import { CurrentTimeStep } from "@dbos-inc/communicator-datetime";

//The Kafka topic and broker configuration
const respondTopic = 'alert-responder-topic';

// KAFKA_BROKER is passed via dbos-config.yaml
const kbroker = process.env['KAFKA_BROKER'] ? process.env['KAFKA_BROKER'] : 'localhost:9092';

const kafkaConfig: KafkaConfig = {
  clientId: 'dbos-kafka-test',
  brokers: [kbroker],
  ssl: process.env['KAFKA_USERNAME'] ? true : false,
  sasl: process.env['KAFKA_USERNAME'] ? {
    mechanism: 'plain',
    username: process.env['KAFKA_USERNAME']!,
    password: process.env['KAFKA_PASSWORD']!,
  } : undefined,
  connectionTimeout: 45000,
  logLevel: logLevel.ERROR
};

const producerConfig: KafkaProduceCommunicator =  configureInstance(KafkaProduceCommunicator, 
  'wfKafka', kafkaConfig, respondTopic, {
    createPartitioner: Partitioners.DefaultPartitioner
  });


//The structure returned to the frontend when an employee asks for an assignment
export interface AlertEmployeeInfo
{
  employee: Employee;
  alert: AlertEmployee[];
  expirationSecs: number | null;
  newAssignment: boolean;
}

@Kafka(kafkaConfig)
export class AlertCenter {

  //This is invoked when a new alert message arrives using the @KafkaConsume decorator
  @Workflow()
  @KafkaConsume(respondTopic)
  static async inboundAlertWorkflow(ctxt: WorkflowContext, topic: string, _partition: number, message: KafkaMessage) {
    const payload = JSON.parse(message.value!.toString()) as {
      alerts: AlertWithMessage[],
    };
    ctxt.logger.info(`Received alert: ${JSON.stringify(payload)}`);
    //Add to the database
    for (const detail of payload.alerts) {
      await ctxt.invoke(RespondUtilities).addAlert(detail);
    }
    return Promise.resolve();
  }


  //This is invoked when:
  // 1. An employee asks for a new assignment, or
  // 2. An employee asks for more time with the existing assignment, or
  // 3. There's a simple refresh of the page to let the employee know how much time is left
  @Workflow()
  static async userAssignmentWorkflow(ctxt: WorkflowContext, name: string, @ArgOptional more_time: boolean | undefined) {
    
    // Get the current time from a checkpointed step;
    //   This ensures the same time is used for recovery or in the time-travel debugger
    let ctime = await ctxt.invoke(CurrentTimeStep).getCurrentTime();

    //Assign, extend time or simply return current assignment
    const userRec = await ctxt.invoke(RespondUtilities).getUserAssignment(name, ctime, more_time);
    
    //Get the expiration time (if there is a current assignment); use setEvent to provide it to the caller
    const expirationSecs = userRec.employee.expiration ? (userRec.employee.expiration!.getTime()-ctime) / 1000 : null;
    await ctxt.setEvent<AlertEmployeeInfo>('rec', {...userRec, expirationSecs});

    if (userRec.newAssignment) {

      //First time we assigned this alert to this employee. 
      //Here we start a loop that sleeps, wakes up and checks if the assignment has expired
      ctxt.logger.info(`Start watch workflow for ${name}`);
      let expirationMS = userRec.employee.expiration ? userRec.employee.expiration.getTime() : 0;

      while (expirationMS > ctime) {
        ctxt.logger.debug(`Sleeping ${expirationMS-ctime}`);
        await ctxt.sleepms(expirationMS - ctime);
        const curDate = await ctxt.invoke(CurrentTimeStep).getCurrentDate();
        ctime = curDate.getTime();
        const nextTime = await ctxt.invoke(RespondUtilities).checkForExpiredAssignment(name, curDate);

        if (!nextTime) {
          //The time on this assignment expired, and we can stop monitoring it
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


  //Produce a new alert message to our broker
  @PostApi('/do_send')
  @Workflow()
  static async sendAlert(ctxt: WorkflowContext, message: string) {

    const max_id = await ctxt.invoke(RespondUtilities).getMaxId();
    await ctxt.invoke(producerConfig).sendMessage(
      {
        value: JSON.stringify({
          alerts: [
            { 
              alert_id: max_id+1,
              alert_status: AlertStatus.ACTIVE,
              message: message
            }
          ]
        })
      }
    );
  }
}
