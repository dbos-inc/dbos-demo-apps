import { DBOS } from '@dbos-inc/dbos-sdk';
import { RespondUtilities, AlertEmployee, AlertStatus, AlertWithMessage, Employee, dkoa } from './utilities';
export { Frontend } from './frontend';

import { Kafka, KafkaMessage, logLevel, KafkaConfig } from 'kafkajs';
import { KafkaReceiver } from '@dbos-inc/kafkajs-receive';

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

const kafkaReceiver = new KafkaReceiver(kafkaConfig);

const kafka = new Kafka(kafkaConfig);
export const producer = kafka.producer();

async function setupTopics(kafka: Kafka, topics: string[]) {
  const admin = kafka.admin();
  try {
    await admin.connect();
    // Delete and recreate topics to ensure a clean state
    const existingTopics = await admin.listTopics();
    const topicsToDelete = topics.filter((t) => existingTopics.includes(t));
    await admin.deleteTopics({ topics: topicsToDelete, timeout: 5000 });

    await new Promise((r) => setTimeout(r, 3000));
    await admin.createTopics({
      topics: topics.map((t) => ({
        topic: t,
        numPartitions: 1,
        replicationFactor: 1,
      })),
      timeout: 5000,
    });
  } finally {
    await admin.disconnect();
  }
}

export async function setUpKafka() {
  return await Promise.all([setupTopics(kafka, [respondTopic]), producer.connect()])  
}

//const producerConfig: KafkaProduceStep = new KafkaProduceStep(
//  'wfKafka', kafkaConfig, respondTopic, {
//    createPartitioner: Partitioners.DefaultPartitioner
//  });

//The structure returned to the frontend when an employee asks for an assignment
export interface AlertEmployeeInfo
{
  employee: Employee;
  alert: AlertEmployee[];
  expirationSecs: number | null;
  newAssignment: boolean;
}

export class AlertCenter {

  //This is invoked when a new alert message arrives using the @KafkaConsume decorator
  @DBOS.workflow()
  @kafkaReceiver.consumer(respondTopic)
  static async inboundAlertWorkflow(_topic: string, _partition: number, message: KafkaMessage) {
    const payload = JSON.parse(message.value!.toString()) as {
      alerts: AlertWithMessage[],
    };
    DBOS.logger.info(`Received alert: ${JSON.stringify(payload)}`);
    //Add to the database
    for (const detail of payload.alerts) {
      await RespondUtilities.addAlert(detail);
    }
    return Promise.resolve();
  }


  //This is invoked when:
  // 1. An employee asks for a new assignment, or
  // 2. An employee asks for more time with the existing assignment, or
  // 3. There's a simple refresh of the page to let the employee know how much time is left
  @DBOS.workflow()
  static async userAssignmentWorkflow(name: string, more_time: boolean | undefined) {
    
    // Get the current time from a checkpointed step;
    //   This ensures the same time is used for recovery or in the time-travel debugger
    let ctime = await DBOS.now();

    //Assign, extend time or simply return current assignment
    const userRec = await RespondUtilities.getUserAssignment(name, ctime, more_time);
    
    //Get the expiration time (if there is a current assignment); use setEvent to provide it to the caller
    const expirationSecs = userRec.employee.expiration ? (userRec.employee.expiration!.getTime()-ctime) / 1000 : null;
    await DBOS.setEvent<AlertEmployeeInfo>('rec', {...userRec, expirationSecs});

    if (userRec.newAssignment) {

      //First time we assigned this alert to this employee. 
      //Here we start a loop that sleeps, wakes up and checks if the assignment has expired
      DBOS.logger.info(`Start watch workflow for ${name}`);
      let expirationMS = userRec.employee.expiration ? userRec.employee.expiration.getTime() : 0;

      while (expirationMS > ctime) {
        DBOS.logger.debug(`Sleeping ${expirationMS-ctime}`);
        await DBOS.sleepms(expirationMS - ctime);
        ctime = await DBOS.now();
        const nextTime = await RespondUtilities.checkForExpiredAssignment(name, ctime);

        if (!nextTime) {
          //The time on this assignment expired, and we can stop monitoring it
          DBOS.logger.info(`Assignment for ${name} ended; no longer watching.`);
          break;
        }

        expirationMS = nextTime.getTime();
        DBOS.logger.info(`Going around again: ${expirationMS} / ${ctime}`);
      }
    }
  }


  @dkoa.postApi('/crash_application')
  static async crashApplication() {
    // For testing and demo purposes :)
    process.exit(1);
    return Promise.resolve();
  }


  //Produce a new alert message to our broker
  @dkoa.postApi('/do_send')
  @DBOS.workflow()
  static async sendAlert(message: string) {
    const max_id = await RespondUtilities.getMaxId();
    await DBOS.runStep(async () => {
      producer.send(
        {
          topic: respondTopic,
          messages: [{
            value: JSON.stringify({
              alerts: [
                { 
                  alert_id: max_id+1,
                  alert_status: AlertStatus.ACTIVE,
                  message: message
                }
              ]
            })
          }]
        }
      )
    });
  }
}
