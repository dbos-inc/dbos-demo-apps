# DBOS Widget Store

## Setting up the app

```shell
cd widget-store
npm install @dbos-inc/dbos-cloud@latest
#if this is your first time using cloud, register:
npx dbos-cloud register -u <username>
#else, login
npx dbos-cloud login
npx dbos-cloud db provision <db-name> -U <username> -W <password>
npx dbos-cloud app register -d <db-name>
npx dbos-cloud app deploy
npx dbos-cloud dashboard launch
```

To reset the inventory counter, run `npx dbos-cloud app deploy` again.

## Usage

Visit the main app page for an opportunity to buy a widget! Buying a widget decrements the remaining inventory. Clicking "Buy Now" takes you to a `/payment/workflow-UUID` confirmation page that simulates payment processing. Visit the `/crash` page for an opportunity to crash the app. After crashing, any in-progress `/payment` page will momentarily become inaccessible but then recover to its appropriate state, allowing you to continue where you left off. After payment has been confirmed or denied for a specific worklow, revisiting `/payment/old-UUID` will not change the settled order.

## Nightly Sales Reports (Optional)

As per [this blog post](https://www.dbos.dev/blog/how-to-build-cloud-cron-jobs), the DBOS Widget Store can send out nightly email sales reports, illustrating [scheduled workflows](https://docs.dbos.dev/tutorials/scheduled-workflows) and an [email library](https://www.npmjs.com/package/@dbos-inc/communicator-email-ses).

To enable the features, set up your email accounts in [SES](https://us-east-2.console.aws.amazon.com/ses/home) and then set the following environment variables before launching the widget store:

* AWS\_REGION - AWS region with SES access
* AWS\_ACCESS\_KEY\_ID - AWS Access key with permission to send email in SES
* AWS\_SECRET\_ACCESS\_KEY - Secret associated with AWS\_ACCESS\_KEY\_ID above
* REPORT\_EMAIL\_FROM\_ADDRESS - Email `From` address; this needs to be a registered identity in SES
* REPORT\_EMAIL\_TO\_ADDRESS - Email `To` address; if you are in SES sandbox mode this must also be a verified address in your identities list

## Widget Fulfillment Department (Optional)

The Widget Store has a companion [Widget Fulfillment app](https://github.com/dbos-inc/dbos-demo-apps/tree/main/widget-fulfillment) that demonstrates a simple packing and shipping station system.

In order to use the fulfillment app, a Kafka broker must be set up to publish orders from the store.  If you do not have a kafka broker, one can be set up with the following `docker-compose` script:

```
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
```

After Kafka is running, set the `KAFKA_BROKER` (use `localhost:9092` for the local broker above) environment variable and restart the widget store app.  Orders will then be automatically published to Kafka for consumption by other apps, such as fulfillment.