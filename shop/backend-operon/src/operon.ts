import { TransactionContext, WorkflowContext, Operon, OperonConfig, CommunicatorContext, OperonWorkflow, OperonTransaction } from 'operon';
import Stripe from 'stripe';
import { v1 as uuidv1 } from 'uuid';

const stripe = new Stripe(process.env.STRIPE_API_KEY || 'error_no_stripe_key', { apiVersion: '2022-11-15' });
const endpointSecret: string = process.env.STRIPE_WEBHOOK_SECRET || 'error_no_webhook_secret';

const checkout_topic = "stripe_checkout";
const event_topic = "stripe_event";

export async function initializeOperon(): Promise<OperonShop> {

    const operon: Operon = new Operon();

    operon.useNodePostgres();

    operon.registerTopic(checkout_topic);
    operon.registerTopic(event_topic);

    operon.registerCommunicator($OperonShop.createStripeSession);
    operon.registerCommunicator($OperonShop.retrieveStripeSession);

    operon.registerDecoratedWT();

    await operon.init();

    return {
        // TODO: take workflow uuid as a parameter (https://github.com/dbos-inc/operon-demo-apps/issues/24)
        async runPaymentWorkflow(username, origin) {
            const uuid: string = uuidv1();
            operon.workflow($OperonShop.paymentWorkflow, { workflowUUID: uuid }, username, origin);
            return await operon.recv<string | null>({}, checkout_topic, uuid, 10);
        },

        getCart(username) { return operon.transaction($OperonShop.getCart, {}, username); },
        addToCart(username, product_id) { return operon.transaction($OperonShop.addToCart, {}, username, product_id); },
        clearCart(username) { return operon.transaction($OperonShop.clearCart, {}, username); },
        getProducts() { return operon.transaction($OperonShop.getProducts, {}); },
        getProduct(id) { return operon.transaction($OperonShop.getProduct, {}, id); },
        async stripeWebhook(sigHeader, payload) {
            let event = stripe.webhooks.constructEvent(payload, sigHeader, endpointSecret);
            if (event.type === 'checkout.session.completed') {
                const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Response<Stripe.Checkout.Session>).id);
                if (session.client_reference_id !== null) {
                    const uuid: string = session.client_reference_id;
                    await operon.send({}, event_topic, uuid, "checkout.session.completed");
                }
            }
        },
    };
}

export interface OperonShop {
    clearCart(username: string): Promise<void>;
    getCart(username: string): Promise<DisplayPriceProduct[]>;
    addToCart(username: string, product_id: string): Promise<void>;
    getProduct(id: number): Promise<DisplayPriceProduct | null>;
    getProducts(): Promise<DisplayPriceProduct[]>;
    runPaymentWorkflow(username: string, origin: string): Promise<string | null>;
    stripeWebhook(sigHeader: string, payload: string): Promise<void>;
}

// domain objects

const OrderStatus = {
    PENDING: 0,
    FULFILLED: 1,
    CANCELLED: -1,
};

interface Product {
    product_id: number,
    product: string,
    description: string,
    image_name: string,
    price: number,
    inventory: number,
}

interface DisplayPriceProduct extends Product {
    display_price: string;
}


// Transactions

class $OperonShop {

    @OperonTransaction({readOnly: true})
    static async getProducts(ctxt: TransactionContext): Promise<DisplayPriceProduct[]> {
        const { rows } = await ctxt.pgClient.query<Product>('SELECT product_id, product, description, image_name, price FROM products');
        const formattedRows: DisplayPriceProduct[] = rows.map((row) => ({
            ...row,
            display_price: (row.price / 100).toFixed(2),
        }));

        return formattedRows;
    }

    @OperonTransaction({readOnly: true})
    static async getProduct(ctxt: TransactionContext, id: number): Promise<DisplayPriceProduct | null> {
        const { rows } = await ctxt.pgClient.query<Product>(`SELECT product_id, product, description, image_name, price FROM products WHERE product_id = $1`, [id]);
        if (rows.length === 0) {
            return null;
        }
        const product: DisplayPriceProduct = {
            ...rows[0],
            display_price: (rows[0].price / 100).toFixed(2),
        };
        return product;
    }

    @OperonTransaction()
    static async addToCart(ctxt: TransactionContext, username: string, product_id: string) {
        await ctxt.pgClient.query(`INSERT INTO cart VALUES($1, $2, 1) ON CONFLICT (username, product_id) DO UPDATE SET quantity = cart.quantity + 1`, [username, product_id]);
    }

    @OperonTransaction({readOnly: true})
    static async getCart(ctxt: TransactionContext, username: string): Promise<DisplayPriceProduct[]> {
        const { rows } = await ctxt.pgClient.query(`SELECT product_id, quantity FROM cart WHERE username=$1`, [username]);
        const productDetails = await Promise.all(rows.map(async (row) => ({
            ...(await $OperonShop.getProduct(ctxt, row.product_id))!,
            inventory: row.quantity,
        })));
        return productDetails;
    }

    @OperonTransaction()
    static async clearCart(ctxt: TransactionContext, username: string) {
        await ctxt.pgClient.query(`DELETE FROM cart WHERE username=$1`, [username]);
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
    static async createOrder(ctxt: TransactionContext, username: string, productDetails: Product[]) {
        const { rows } = await ctxt.pgClient.query(`INSERT INTO orders(username, order_status, last_update_time) VALUES ($1, $2, $3) RETURNING order_id`,
            [username, OrderStatus.PENDING, 0]);
        const orderID: number = rows[0].order_id;
        for (const product of productDetails) {
            await ctxt.pgClient.query(`INSERT INTO order_items(order_id, product_id, price, quantity) VALUES($1, $2, $3, $4)`,
                [orderID, product.product_id, product.price, product.inventory]);
        }
        return orderID;
    }

    @OperonTransaction()
    static async fulfillOrder(ctxt: TransactionContext, orderID: number) {
        await ctxt.pgClient.query(`UPDATE orders SET order_status=$1 WHERE order_id=$2`, [OrderStatus.FULFILLED, orderID]);
    }

    @OperonTransaction()
    static async errorOrder(ctxt: TransactionContext, orderID: number) {
        await ctxt.pgClient.query(`UPDATE orders SET order_status=$1 WHERE order_id=$2`, [OrderStatus.CANCELLED, orderID]);
    }

    // External Communicators

    static async createStripeSession(ctxt: CommunicatorContext, uuid: string, productDetails: Product[], origin: string) {
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
        const session: Stripe.Response<Stripe.Checkout.Session> = await stripe.checkout.sessions.create({
            line_items: lineItems,
            mode: 'payment',
            client_reference_id: uuid,
            success_url: `${origin}/checkout/success`,
            cancel_url: `${origin}/checkout/cancel`,
        });
        return session;
    }

    static async retrieveStripeSession(ctxt: CommunicatorContext, sessionID: string) {
        const session = await stripe.checkout.sessions.retrieve(sessionID);
        try {
            await stripe.checkout.sessions.expire(sessionID); // Ensure nothing changes in the session.
        } catch (err) {
            // Session was already expired.
        }
        return session;
    }

    @OperonWorkflow()
    static async paymentWorkflow(ctxt: WorkflowContext, username: string, origin: string) {
        const uuid: string = ctxt.workflowUUID;
        const productDetails: Product[] = await ctxt.transaction($OperonShop.getCart, username);
        if (productDetails.length === 0) {
            await ctxt.send(checkout_topic, uuid, null);
            return;
        }
        const orderID: number = await ctxt.transaction($OperonShop.createOrder, username, productDetails);
        const valid: boolean = await ctxt.transaction($OperonShop.subtractInventory, productDetails);
        if (!valid) {
            await ctxt.send(checkout_topic, uuid, null);
            return;
        }
        const stripeSession = await ctxt.external($OperonShop.createStripeSession, uuid, productDetails, origin);
        if (stripeSession === null || stripeSession.url === null) {
            await ctxt.transaction($OperonShop.undoSubtractInventory, productDetails);
            await ctxt.send(checkout_topic, uuid, null);
            return;
        }
        await ctxt.send(checkout_topic, uuid, stripeSession.url);
        const notification = await ctxt.recv<string | null>(event_topic, uuid, 60);
        if (notification !== null) {
            await ctxt.transaction($OperonShop.fulfillOrder, orderID);
            await ctxt.transaction($OperonShop.clearCart, username);
        } else {
            const updatedSession = await ctxt.external($OperonShop.retrieveStripeSession, stripeSession.id);
            if (updatedSession === null) {
                console.error(`Recovering order #${orderID} failed: Stripe unreachable`);
                return;
            }
            const paymentStatus: string = updatedSession.payment_status;
            if (paymentStatus == 'paid') {
                await ctxt.transaction($OperonShop.fulfillOrder, orderID);
                await ctxt.transaction($OperonShop.clearCart, username);
            } else if (paymentStatus == 'unpaid') {
                await ctxt.transaction($OperonShop.undoSubtractInventory, productDetails);
                await ctxt.transaction($OperonShop.errorOrder, orderID);
            } else {
                console.error(`Unrecognized payment status: ${paymentStatus}`);
            }
        }
    }
}