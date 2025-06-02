# DBOS Alert Response Center

This app demonstrates producing and consuming Kafka messages from DBOS. A Kafka message creates an alert. Alerts are placed into a database queue. Employees can log in to the portal and respond to any outstanding alerts. After an employee gets an assignment, they have 30 seconds to fix the issue! After the time expires, the alert may be reassigned to a different employee. All incoming alert messages are handled exactly once.

## Running up the app locally

Make sure you have a local postgres setup and Docker installed, as shown in the [Quickstart](https://docs.dbos.dev/quickstart?language=typescript#run-your-app-locally). Then:

Using Docker, start a Kafka broker with the provided file:
```shell
cd alert-center
export KAFKA_BROKER="localhost:9092"
docker-compose -f kafka-compose.yml up
```
This will start a session with terminal output. You can leave it running.

Then, in another terminal window, build build, migrate and run the app:
```shell
cd alert-center
export KAFKA_BROKER="localhost:9092"
export PGPASSWORD="..." #export your password if using Docker for Postgres
npm install
npm run build
npx knex migrate:latest

# in order to restart on crash, we run the app in a loop. On Linux or Mac:
while [ 1 ] ; do npx dbos start; done 
# Alternatively you can use regular npx dbos start
```

## Running with a Kafka Broker in the Cloud

If you have an existing Kafka broker you'd like to use, pass the URL and port to the app via the environment variable `KAFKA_BROKER` like so:
```shell
export KAFKA_BROKER="broker1.example.com:9092"
```

If you have set up Kafka security on your cloud broker (perhaps using [Confluent Cloud](#setting-up-confluent-cloud)), you may also need to export the credentials:

```shell
export KAFKA_USERNAME='7...V'
export KAFKA_PASSWORD='X/...v'
```

After exporting these environment varables, running `dbos-cloud app deploy` will pass the broker URL, credentials, and the app code to DBOS Cloud for deployment.

## Usage
Visit the app on http://localhost:3000/

You will be presented with the login screen, as if you are reporting for duty in the alert center. 

Entering a name will automatically register you as an employee, if you are not already registered.  Either way, the system will then check to see if any alerts need to be handled.  If there is not an an alert, the screen will refresh until one comes in.  When an alert occurs, the response screen will display its message and give you options to:

* Mark the alert as RESOLVED
* Request more time to respond
* Log out, and release the alert for other employees to handle

If no buttons are pressed in the allotted processing time, the alert will be can be re-assigned to other logged-in employees. You can log in as different employees from different browser tabs and observe the assignment changes.

## Creating Alerts

You can use the text box and button on the right to create new alerts. You can create several alerts which will be queued up. 

## Setting Up Confluent Cloud

Confluent provides a [simple cloud setup for Kafka](https://www.confluent.io/get-started/).

While the specific steps are detailed on their website, the basic steps are:
*  Sign up for an account.
*  Provision a broker (probably in AWS, but that is not essential).
*  Create the topic `alert-responder-topic`; if you do not do this the broker will not accept messages from the app.
*  Create a set of development credentials; if these are correct the returned information will indicate `security.protocol=SASL_SSL` and `sasl.mechanisms=PLAIN`.
*  Export the returned value of `bootstrap.servers` for `KAFKA_BROKER`.
*  Export the returned value of `sasl.username` for `KAFKA_USERNAME` and `sasl.password` for `KAFKA_PASSWORD`.

Afterward, the Alert Responce Center app can be run locally using cloud-based Kafka, or can be deployed to DBOS cloud.