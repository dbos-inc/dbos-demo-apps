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
