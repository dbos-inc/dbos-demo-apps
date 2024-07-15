# DBOS Widget Store - Fulfillment Department

Visit the main [widget store](../widget-store/README.md) app for an opportunity to buy a widget!

After payment is complete, your order comes here for fulfillment (if you have Kafka working, that is, so see the instructions in the Widget Store for setting it up).

Currently, it is easiest to run the Widget Store and Widget Fulfillment Department app locally, with a local Kafka.

## Setting up the app

To run the Widget Fulfillment Department, export the `KAFKA_BROKER` environment variable (`localhost:9092` if using instructions for local Kafka) and then:

```shell
cd widget-fulfillment
npm install
npm run dev
```

## Usage
By default, the app is [on port 3500](http://localhost:3500/).

You will be presented with the login screen, as if you are reporting for duty in the fulfillment center.  (If you want to see the dashboard, or experiment with crashing the app, see the links in the lower left.)

Entering a name will automatically register you as an order packer, if you are not already registered.  Either way, the system will then check to see if any orders need to be packed and shipped.  If there is not an an order, the screen will refresh until an order is available.  When an order is available, the order packing screen will show the contents of the order to be packed, and provide buttons to:

* Mark order as fulfilled
* Request more time to fulfill the order
* Cancel, and release the order to other packing staff

If no buttons are pressed in the allotted processing time, the order will be released for other packers.


