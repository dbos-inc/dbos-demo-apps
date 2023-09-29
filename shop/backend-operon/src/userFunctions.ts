import {
    TransactionContext, WorkflowContext, OperonTransaction, OperonWorkflow, HandlerContext,
    GetApi, PostApi, OperonCommunicator, CommunicatorContext, OperonResponseError, ArgSource, ArgSources
} from '@dbos-inc/operon';
import Stripe from 'stripe';

export const OrderStatus = {
    PENDING: 0,
    FULFILLED: 1,
    CANCELLED: -1,
};

export interface Product {
    product_id: number,
    product: string,
    description: string,
    image_name: string,
    price: number,
    inventory: number,
    display_price: string;
}

const stripe = new Stripe(process.env.STRIPE_API_KEY || 'error_no_stripe_key', { apiVersion: '2023-08-16' });
const endpointSecret: string = process.env.STRIPE_WEBHOOK_SECRET || 'error_no_webhook_secret';

const checkout_url_topic = "stripe_checkout_url";
const checkout_complete_topic = "stripe_checkout_complete";

export class Shop {

    @GetApi('/api/products')
    @OperonTransaction()
    static async getProducts(txnCtxt: TransactionContext): Promise<Product[]> {
        const { rows } = await txnCtxt.pgClient.query<Product>('SELECT product_id, product, description, image_name, price FROM products');
        const formattedRows: Product[] = rows.map((row) => ({
            ...row,
            display_price: (row.price / 100).toFixed(2),
        }));

        return formattedRows;
    }

    @GetApi('/api/products/:id')
    @OperonTransaction({ readOnly: true })
    static async getProduct(ctxt: TransactionContext, id: number): Promise<Product | null> {
        const { rows } = await ctxt.pgClient.query<Product>(`SELECT product_id, product, description, image_name, price FROM products WHERE product_id = $1`, [id]);
        if (rows.length === 0) {
            return null;
        }
        const product: Product = {
            ...rows[0],
            display_price: (rows[0].price / 100).toFixed(2),
        };
        return product;
    }

    @PostApi('/api/add_to_cart')
    @OperonTransaction()
    static async addToCart(ctxt: TransactionContext, username: string, product_id: string | number) {
        await ctxt.pgClient.query(`INSERT INTO cart VALUES($1, $2, 1) ON CONFLICT (username, product_id) DO UPDATE SET quantity = cart.quantity + 1`, [username, product_id]);
    }

    @PostApi('/api/get_cart')
    @OperonTransaction({ readOnly: true })
    static async getCart(ctxt: TransactionContext, username: string): Promise<Product[]> {
        const { rows } = await ctxt.pgClient.query<{ product_id: number, quantity: number }>(`SELECT product_id, quantity FROM cart WHERE username=$1`, [username]);
        const productDetails = await Promise.all(rows.map(async (row) => ({
            ...(await Shop.getProduct(ctxt, row.product_id))!,
            inventory: row.quantity,
        })));
        return productDetails;
    }

    @PostApi('/api/checkout_session')
    static async webCheckout(ctxt: HandlerContext, @ArgSource(ArgSources.QUERY) username: string) {
        const origin = ctxt.request?.headers.origin as string;
        if (typeof username !== 'string' || typeof origin !== 'string') {
            throw new OperonResponseError("Invalid request!", 400);
        }
        const handle = ctxt.invoke(Shop).paymentWorkflow({}, username, origin);
        const url = await ctxt.getEvent<string>(handle.getWorkflowUUID(), checkout_url_topic);

        if (url === null) {
            ctxt.koaContext.redirect(`${origin}/checkout/cancel`);
        } else {
            ctxt.koaContext.redirect(url);
        }
    }

    @OperonWorkflow()
    static async paymentWorkflow(ctxt: WorkflowContext, username: string, origin: string) {
        const productDetails = await ctxt.invoke(Shop).getCart(username);
        if (productDetails.length === 0) {
            await ctxt.setEvent(checkout_url_topic, null);
            return;
        }

        const orderID = await ctxt.invoke(Shop).createOrder(username, productDetails);

        const valid: boolean = await ctxt.invoke(Shop).subtractInventory(productDetails);
        if (!valid) {
            await ctxt.setEvent(checkout_url_topic, null);
            return;
        }

        const stripeSession = await ctxt.invoke(Shop).createStripeSession(productDetails, origin);
        if (!stripeSession?.url) {
            await ctxt.invoke(Shop).undoSubtractInventory(productDetails);
            await ctxt.setEvent(checkout_url_topic, null);
            return;
        }

        await ctxt.setEvent(checkout_url_topic, stripeSession.url);
        const notification = await ctxt.recv<string>(checkout_complete_topic, 60);

        // if the checkout complete notification arrived, the payment is successful so fulfull the order
        if (notification) {
            await ctxt.invoke(Shop).fulfillOrder(orderID);
            await ctxt.invoke(Shop).clearCart(username);
            return;
        }

        // if the checkout complete notification didn't arrive in time, retrive the session information 
        // in order to check the payment status explicitly 
        const updatedSession = await ctxt.external(Shop.retrieveStripeSession, stripeSession.id);
        if (!updatedSession) {
            // TODO: should we do something more meaningful if we can't retrieve the stripe session?
            console.error(`Recovering order #${orderID} failed: Stripe unreachable`);
            return;
        }

        if (updatedSession.payment_status == 'paid') {
            await ctxt.invoke(Shop).fulfillOrder(orderID);
            await ctxt.invoke(Shop).clearCart(username);
        } else {
            await ctxt.invoke(Shop).undoSubtractInventory(productDetails);
            await ctxt.invoke(Shop).errorOrder(orderID);
        }
    }

    @OperonTransaction()
    static async createOrder(ctxt: TransactionContext, username: string, productDetails: Product[]): Promise<number> {
        const { rows } = await ctxt.pgClient.query<{ order_id: number }>(`INSERT INTO orders(username, order_status, last_update_time) VALUES ($1, $2, $3) RETURNING order_id`,
            [username, OrderStatus.PENDING, 0]);
        const orderID: number = rows[0].order_id;
        for (const product of productDetails) {
            await ctxt.pgClient.query(`INSERT INTO order_items(order_id, product_id, price, quantity) VALUES($1, $2, $3, $4)`,
                [orderID, product.product_id, product.price, product.inventory]);
        }
        return orderID;
    }

    @OperonTransaction()
    static async subtractInventory(ctxt: TransactionContext, products: Product[]): Promise<boolean> {
        let hasEnoughInventory = true;
        for (const product of products) {
            const { rows } = await ctxt.pgClient.query<Product>(`SELECT inventory FROM products WHERE product_id = $1`, [product.product_id]);
            const currentInventory = rows[0]?.inventory;

            if (currentInventory < product.inventory) {
                hasEnoughInventory = false;
                break;
            }
        }
        if (hasEnoughInventory) {
            // If all products have enough inventory, subtract the inventory from the products in the database
            for (const product of products) {
                await ctxt.pgClient.query(`UPDATE products SET inventory = inventory - $1 WHERE product_id = $2`, [product.inventory, product.product_id]);
            }
        }
        return hasEnoughInventory;
    }

    @OperonTransaction()
    static async undoSubtractInventory(ctxt: TransactionContext, products: Product[]) {
        for (const product of products) {
            await ctxt.pgClient.query(`UPDATE products SET inventory = inventory + $1 WHERE product_id = $2`, [product.inventory, product.product_id]);
        }
    }

    @OperonTransaction()
    static async fulfillOrder(ctxt: TransactionContext, orderID: number) {
        await ctxt.pgClient.query(`UPDATE orders SET order_status=$1 WHERE order_id=$2`, [OrderStatus.FULFILLED, orderID]);
    }

    @OperonTransaction()
    static async errorOrder(ctxt: TransactionContext, orderID: number) {
        await ctxt.pgClient.query(`UPDATE orders SET order_status=$1 WHERE order_id=$2`, [OrderStatus.CANCELLED, orderID]);
    }

    @OperonTransaction()
    static async clearCart(ctxt: TransactionContext, username: string) {
        await ctxt.pgClient.query(`DELETE FROM cart WHERE username=$1`, [username]);
    }

    @OperonCommunicator()
    static async createStripeSession(ctxt: CommunicatorContext, productDetails: Product[], origin: string): Promise<Stripe.Response<Stripe.Checkout.Session>> {
        const lineItems = productDetails.map((item) => ({
            quantity: item.inventory,
            price_data: {
                currency: "usd",
                unit_amount: item.price,
                product_data: {
                    name: item.product,
                }
            }
        }));
        return await stripe.checkout.sessions.create({
            line_items: lineItems,
            mode: 'payment',
            client_reference_id: ctxt.workflowUUID,
            success_url: `${origin}/checkout/success`,
            cancel_url: `${origin}/checkout/cancel`,
        });
    }

    @OperonCommunicator()
    static async retrieveStripeSession(_ctxt: CommunicatorContext, sessionID: string): Promise<Stripe.Response<Stripe.Checkout.Session>> {
        const session = await stripe.checkout.sessions.retrieve(sessionID);
        try {
            await stripe.checkout.sessions.expire(sessionID); // Ensure nothing changes in the session.
        } catch (err) {
            // Session was already expired.
        }
        return session;
    }

    @PostApi('/stripe_webhook')
    static async stripeWebhook(ctxt: HandlerContext) {
        const req = ctxt.koaContext.request;
        const sigHeader = req.headers['stripe-signature'];
        if (typeof sigHeader !== 'string') {
            throw new OperonResponseError("Invalid Header", 400);
        }
        const payload: string = req.rawBody;
        try {
            const event = stripe.webhooks.constructEvent(payload, sigHeader, endpointSecret);
            if (event.type === 'checkout.session.completed') {
                const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Response<Stripe.Checkout.Session>).id);
                if (session.client_reference_id !== null) {
                    const uuid: string = session.client_reference_id;
                    await ctxt.send({}, uuid, "checkout.session.completed", checkout_complete_topic);
                }
            }
        } catch (err) {
            console.log(err);
            throw new OperonResponseError("Webhook Error", 400);
        }
    }
}