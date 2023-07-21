import express, { Request, Response, NextFunction } from "express";
import { Pool } from 'pg';
import cors from 'cors';
import Stripe from 'stripe';

// Create a new express application instance
const app: express.Application = express();
const stripe = new Stripe(process.env.STRIPE_API_KEY || 'error_no_stripe_key', {
    apiVersion: '2022-11-15',
});

const endpointSecret: string = process.env.STRIPE_WEBHOOK_SECRET || 'error_no_webhook_secret';

const orderTimeBeforeErrorSec: number = 60;
const orderRecoveryThreadPeriodMillis = 5000;

// The port the express app will listen on
const port: number = 8082;

// Create Postgres connection
const pool = new Pool({
    user: 'shop',
    host: process.env.POSTGRES_HOST || 'localhost',
    database: 'shop',
    password: 'shop',
    port: 5432,
});

const OrderStatus = {
    INIT: 1,
    ERROR_INIT: -1,
    CREATE_SESSION: 2,
    FULFILLED: 3,
    ERROR_HANDLED: -3,
};

const ProductOperations = {
    SUBTRACT_INVENTORY: 1,
    UNDO_SUBTRACT_INVENTORY: 2,
};

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Before the middleware because it uses custom middleware.
app.post('/stripe_webhook', express.raw({type: 'application/json'}), asyncHandler(async (req: Request, res: Response) => {
    const sigHeader = req.headers['stripe-signature'];
    const payload: string = (req.body as Buffer).toString();
    if (typeof sigHeader !== 'string') {
        res.status(500).send();
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(payload, sigHeader, endpointSecret);
    } catch (err) {
        console.log(err);
        res.status(400).send(`Webhook Error: ${err}`);
        return;
    }
    if (event.type === 'checkout.session.completed') {
        const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Response<Stripe.Checkout.Session>).id);
        const orderID: number = Number(session.client_reference_id);
        await fulfillOrder(orderID);
        await clearCart(orderID);
    }
    res.status(200).send();
    return;
}));

// Body parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());


app.post('/api/add_to_cart', asyncHandler(async (req: Request, res: Response) => {
    const {username, product_id} = req.body;
    const client = await pool.connect();
    try {
        await client.query(`INSERT INTO cart VALUES($1, $2, 1) ON CONFLICT (username, product_id) DO UPDATE SET quantity = cart.quantity + 1`, [username, product_id]);
        res.status(200).send('Success');
    } catch (err) {
        res.status(500).send('Error adding to cart');
    } finally {
        client.release();
    }
}));

async function getCart(username: string) : Promise<any[]> {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`SELECT product_id, quantity FROM cart WHERE username=$1`, [username]);
        const productDetails = await Promise.all(rows.map(async (row) => ({
            ...await getProduct(row.product_id),
            inventory: row.quantity,
        })));
        return productDetails;
    } catch (err) {
        console.error(err);
        return [];
    } finally {
        client.release();
    }
}

app.post('/api/get_cart', asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.body;
    const productDetails = await getCart(username);
    res.send(productDetails);
}));

app.get('/api/products', asyncHandler(async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT product_id, product, description, image_name, price FROM products');
        const formattedRows = rows.map((row) => ({
            ...row,
            display_price: (row.price / 100).toFixed(2),
        }));
        res.send(formattedRows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    } finally {
        client.release();
    }
}));

async function getProduct(id: number) {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`SELECT product_id, product, description, image_name, price FROM products WHERE product_id = $1`, [id]);
        // Check if any row was returned.
        if (rows.length === 0) {
            return null;
        }
        const product = {
            ...rows[0],
            display_price: (rows[0].price / 100).toFixed(2),
        };
        return product;
    } catch (err) {
        console.error(err);
        return null;
    } finally {
        client.release();
    }
}

app.get('/api/products/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    // Ensure the ID is a valid integer before using it in a SQL query.
    // This is a simple check that prevents SQL injection attacks.
    if (!Number.isInteger(Number(id))) {
        res.status(400).send('Invalid product ID');
        return;
    }

    const product = await getProduct(Number(id));
    if (product == null) {
        res.status(500).send('Error');
    } else {
        res.send(product);
    }
}));

async function subtractInventory(orderID: number, products: Array<any>) : Promise<boolean> {
    let hasEnoughInventory = true;
    const client = await pool.connect();
    try {
        // Start transaction
        await client.query('BEGIN');

        const { rows } = await client.query(`SELECT value from products_idempotency WHERE order_id=$1 AND operation=$2`, [orderID, ProductOperations.SUBTRACT_INVENTORY]);
        if ( rows.length != 0) {
            hasEnoughInventory = Boolean(rows[0]?.value);
            await client.query('ROLLBACK');
            return hasEnoughInventory;
        }

        for (const product of products) {
            const { rows } = await client.query(`SELECT inventory FROM products WHERE product_id = $1`, [product.product_id]);
            const currentInventory = rows[0]?.inventory;

            if (currentInventory < product.inventory) {
                hasEnoughInventory = false;
                break;
            }
        }
        if (hasEnoughInventory) {
            // If all products have enough inventory, subtract the inventory from the products in the database
            for (const product of products) {
                await client.query(`UPDATE products SET inventory = inventory - $1 WHERE product_id = $2`, [product.inventory, product.product_id]);
            }
        }
        // Commit transaction
        await client.query(`INSERT INTO products_idempotency VALUES($1, $2, $3)`, [orderID, ProductOperations.SUBTRACT_INVENTORY, hasEnoughInventory.toString()]);
        await client.query('COMMIT');
        return hasEnoughInventory;
    } catch (err) {
        console.error(err);
        await client.query('ROLLBACK');
        return false;
    } finally {
        client.release();
    }
}

async function undoSubtractInventory(order_id: number, products: Array<any>) : Promise<void> {
    const client = await pool.connect();
    try {
        // Start transaction
        await client.query('BEGIN');
        const { rows } = await pool.query(`SELECT value from products_idempotency WHERE order_id=$1 AND operation=$2`, [order_id, ProductOperations.UNDO_SUBTRACT_INVENTORY]);
        if ( rows.length != 0) {
            await client.query('ROLLBACK');
            return;
        }
        for (const product of products) {
            await client.query(`UPDATE products SET inventory = inventory + $1 WHERE product_id = $2`, [product.inventory, product.product_id]);
        }
        // Commit transaction
        await client.query(`INSERT INTO products_idempotency VALUES($1, $2, '')`, [order_id, ProductOperations.UNDO_SUBTRACT_INVENTORY]);
        await client.query('COMMIT');
    } catch (err) {
        console.error(err);
        // Rollback transaction in case of any other error
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }
}

async function createOrder(username: string, productDetails: any[]) : Promise<number> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`INSERT INTO orders(username, order_status, last_update_time) VALUES ($1, $2, $3) RETURNING order_id`, [username, OrderStatus.INIT, Math.floor(Date.now() / 1000)]);
        const orderID : number = rows[0].order_id;
        for (const product of productDetails) {
            await client.query(`INSERT INTO order_items(order_id, product_id, price, quantity) VALUES($1, $2, $3, $4)`, [orderID, product.product_id, product.price, product.inventory]);
        }
        await client.query('COMMIT');
        return orderID;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        return -1;
    } finally {
        client.release();
    }
}

async function createStripeSession(orderID: number, productDetails: any[], origin: string) {
    const lineItems: any[] = productDetails.map((item) => ({
        quantity: item.inventory,
        price_data: {
            currency: "usd",
            unit_amount: item.price,
            product_data: {
                name: item.product,
            }
        }
    }));
    const session = await stripe.checkout.sessions.create({
        line_items: lineItems,
        mode: 'payment',
        client_reference_id: String(orderID),
        success_url: `${origin}/checkout/success`,
        cancel_url: `${origin}/checkout/cancel`,
      });
      return session;
}

async function recordOrderSession(orderID: number, sessionID: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT order_status FROM orders WHERE order_id=$1', [orderID]);
        if (rows[0].order_status != OrderStatus.INIT) {
            await client.query('ROLLBACK');
            return false;
        }
        await client.query(
            'UPDATE orders SET order_status=$1, stripe_session_id=$2, last_update_time=$3 WHERE order_id=$4',
            [OrderStatus.CREATE_SESSION, sessionID, Math.floor(Date.now() / 1000), orderID]
        );
        await client.query('COMMIT');
        return true;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        return false;
    } finally {
        client.release();
    }
}

app.post('/api/checkout_session', asyncHandler(async (req: Request, res: Response) => {
    const username = req.query.username;
    const origin = req.headers.origin;
    if (typeof username !== 'string' || typeof origin !== 'string'){
        res.status(400).send("Invalid username");
        return;
    }
    const productDetails: any[] = await getCart(username);
    const orderID: number = await createOrder(username, productDetails);
    const valid: boolean = await subtractInventory(orderID, productDetails);
    if (valid) {
        const stripeSession = await createStripeSession(orderID, productDetails, origin);
        if (typeof stripeSession.url === 'string') {
            if (await recordOrderSession(orderID, stripeSession.id)) {
                res.redirect(303, stripeSession.url);
                return;
            }
        }
    }
    res.redirect(303, `${origin}/checkout/cancel`);
    return;
}));

async function fulfillOrder(orderID: number) {
    const client = await pool.connect();
    try {
        await client.query(`UPDATE orders SET order_status=$1 WHERE order_id=$2`, [OrderStatus.FULFILLED, orderID]);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
    }
}

async function clearCart(orderID: number) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT username FROM orders WHERE order_id=$1`, [orderID]);
        const username: string = rows[0].username;
        await client.query(`DELETE FROM cart WHERE username=$1`, [username]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
    } finally {
        client.release();
    }
}

async function retrieveOrderItems(orderID: number) {
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT product_id, price, quantity FROM order_items WHERE order_id=$1', [orderID]);
        const purchases = rows.map((row) => ({
            product_id: row.product_id,
            price: row.price,
            inventory: row.quantity
        }));
        return purchases;
    } finally {
        client.release();
    }
}


async function recoverOrders() {
    const getOrder = 'SELECT * FROM orders WHERE order_status!= $1 AND order_status!= $2 AND (EXTRACT(EPOCH FROM NOW()) - last_update_time) > $3';
    const setError = 'UPDATE orders SET order_status= $1, last_update_time= $2 WHERE order_id= $3';
    const getSession = 'SELECT stripe_session_id FROM orders WHERE order_id= $1'; 
    const client = await pool.connect();
    try {
        while (true) {
            await client.query("BEGIN");
            const { rows } = await client.query(getOrder, [OrderStatus.FULFILLED, OrderStatus.ERROR_HANDLED, orderTimeBeforeErrorSec]);
            if (rows.length === 0) {
                break; // Exit the loop if there are no orders to recover.
            }
            const order = rows[0];
            const orderID: number = Number(order.order_id);
            const orderStatus = order.order_status;
            switch (orderStatus) {
                case OrderStatus.INIT:
                case OrderStatus.ERROR_INIT: {
                    await client.query(setError, [OrderStatus.ERROR_INIT, Math.floor(Date.now() / 1000), orderID]);
                    await client.query("COMMIT"); // Transactionally transition to an error state.
                    const purchases = await retrieveOrderItems(orderID);
                    if (await subtractInventory(orderID, purchases)) {
                        await undoSubtractInventory(orderID, purchases);
                    }
                    await client.query(setError, [OrderStatus.ERROR_HANDLED, Math.floor(Date.now() / 1000), orderID]);
                    break;
                }
                case OrderStatus.CREATE_SESSION: {
                    await client.query("COMMIT"); // No transactional transition needed--we instead expire the Stripe session.
                    const { rows } = await client.query(getSession, [orderID]);
                    const sessionID = rows[0].stripe_session_id;
                    const session = await stripe.checkout.sessions.retrieve(sessionID);
                    try {
                        await stripe.checkout.sessions.expire(sessionID); // Ensure nothing changes in the session.
                    } catch(err) {
                        // Session was already expired.
                    }
                    const paymentStatus = session.payment_status;
                    if (paymentStatus === 'paid') {
                        await fulfillOrder(orderID);
                        await clearCart(orderID);
                    } else if (paymentStatus === 'unpaid') {
                        const purchases = await retrieveOrderItems(orderID);
                        await undoSubtractInventory(orderID, purchases);
                        await client.query(setError, [OrderStatus.ERROR_HANDLED, Math.floor(Date.now() / 1000), orderID]);
                    } else {
                        console.error(`Unrecognized payment status: ${paymentStatus}`);
                    }
                    break;
                }
                default: {
                    console.error(`Invalid status: ${orderID} ${orderStatus}`);
                    break;
                }
            }
        } 
    } finally {
        await client.query("ROLLBACK");
        client.release();
    }
}

function tryRecoverOrders() {
    recoverOrders().catch((err) => {
        console.error(err);
    });
}

setInterval(tryRecoverOrders, orderRecoveryThreadPeriodMillis);

// Serve the application at the given port
app.listen(port, () => {
    // Success callback
    console.log(`Listening at http://localhost:${port}/`);
});
