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

Visit the main app page for an opportunity to buy a widget! Buying a widget decrements the remaining inventory. Clicking "Buy Now" takes you to a confirmation page that simulates payment processing.

The Shop Internals section shows the current inventory and order status of all orders. For each order, after it has been paid, it takes a few more internal steps to process and dispatch it. This is represented by the 'Progress until dispatch' column of the orders table, and is updated every second. If the app crashes while an order is still being processed, it will resume exactly where it left off once the app restarts.

The Server Tools section give you an opportunity to crash the app. After crashing, any in-progress payment page will momentarily become inaccessible but then recover to its appropriate state, allowing you to continue where you left off. After payment has been confirmed or denied for a specific worklow, revisiting `/?payment=old-ID` will not change the settled order.

## Nightly Sales Reports (Optional)

As per [this blog post](https://www.dbos.dev/blog/how-to-build-cloud-cron-jobs), the DBOS Widget Store can send out nightly email sales reports, illustrating [scheduled workflows](https://docs.dbos.dev/typescript/tutorials/scheduled-workflows) and an [email library](https://www.npmjs.com/package/@dbos-inc/dbos-email-ses).

To enable the features, set up your email accounts in [SES](https://us-east-2.console.aws.amazon.com/ses/home) and then set the following environment variables before launching the widget store:

* AWS\_REGION - AWS region with SES access
* AWS\_ACCESS\_KEY\_ID - AWS Access key with permission to send email in SES
* AWS\_SECRET\_ACCESS\_KEY - Secret associated with AWS\_ACCESS\_KEY\_ID above
* REPORT\_EMAIL\_FROM\_ADDRESS - Email `From` address; this needs to be a registered identity in SES
* REPORT\_EMAIL\_TO\_ADDRESS - Email `To` address; if you are in SES sandbox mode this must also be a verified address in your identities list
