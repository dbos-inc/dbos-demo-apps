# DBOS Widget Store

## Setting up the app

## Usage

Visit the main app page for an opportunity to buy a widget! Buying a widget decrements the remaining inventory. Clicking "Buy Now" takes you to a confirmation page that simulates payment processing.

The Shop Internals section shows the current inventory and order status of all orders. For each order, after it has been paid, it takes a few more internal steps to process and dispatch it. This is represented by the 'Progress until dispatch' column of the orders table, and is updated every second. If the app crashes while an order is still being processed, it will resume exactly where it left off once the app restarts.

The Server Tools section give you an opportunity to crash the app. After crashing, any in-progress payment page will momentarily become inaccessible but then recover to its appropriate state, allowing you to continue where you left off. After payment has been confirmed or denied for a specific worklow, revisiting `/?payment=old-ID` will not change the settled order.
