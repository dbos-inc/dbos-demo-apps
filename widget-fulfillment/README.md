# DBOS Widget Store - Fulfillment Department

## Setting up the app

```shell
cd widget-fulfillment
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

Visit the main app page from [widget store](../widget-store/README.md) for an opportunity to buy a widget!

After payment is complete, your order comes here for fulfillment (if you have Kafka working, that is).
