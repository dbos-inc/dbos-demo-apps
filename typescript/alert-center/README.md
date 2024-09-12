# DBOS Alert Response Center

This app demonstrates producing and consuming Kafka messages from DBOS. A Kafka message creates an alert. Alerts are placed into a database queue. Employees can log in to the portal and respond to any outstanding alerts. After an employee gets an assignment, they have 30 seconds to fix the issue! After the time expires, the alert may be reassigned to a different employee. All incoming alert messages are handled exactly once.

## Running up the app locally

Make sure you have a local postgres setup and Docker installed, as shown in the [Quickstart](https://docs.dbos.dev/quickstart?language=typescript). Then:

Using Docker, start a Kafka broker with the provided file:
```shell
cd alert-center
export KAFKA_BROKER="localhost:9092"
docker-compose -f kafka-compose.yml up
```
This will start a session with terminal output. You can leave it running.

Then, build, migrate and run the app:
```shell
cd alert-center
export KAFKA_BROKER="localhost:9092"
export PGPASSWORD="..." #export your password if using Docker for Postgres
npm install
npm run build
npx dbos migrate

# in order to restart on crash, we run the app in a loop. On Linux or Mac:
while [ 1 ] ; do npx dbos start; done 
# Alternatively you can use regular npx dbos-start
```

## Usage
Visit the app on http://localhost:3000/

You will be presented with the login screen, as if you are reporting for duty in the alert center. 

Entering a name will automatically register you as an employee, if you are not already registered.  Either way, the system will then check to see if any alerts need to be handled.  If there is not an an alert, the screen will refresh until one comes in.  When an alert occurs, the response screen will display its message and give you options to:

* Mark the alert as RESOLVED
* Request more time to respond
* Cancel, and release the alert for other employeeds

If no buttons are pressed in the allotted processing time, the alert will be released and can be re-assigned to other employees.

## Creating Alerts

You can use the text box and button on the right to create new alerts. You can also used the attached python script `send_alert.py`. Use the red "Crash" button on the right to stop the application at any point. When restarted, the app will resume where left off. 