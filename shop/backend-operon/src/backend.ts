import express, { Request, Response, NextFunction } from "express";
import { TransactionContext, WorkflowContext, Operon } from 'operon';
import cors from 'cors';
import Stripe from 'stripe';

const port: number = 8082;
const stripe = new Stripe(process.env.STRIPE_API_KEY || 'error_no_stripe_key', {
    apiVersion: '2022-11-15',
});
const endpointSecret: string = process.env.STRIPE_WEBHOOK_SECRET || 'error_no_webhook_secret';

// Wrapper for async express handlers.
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Create an Operon.
const operon: Operon = new Operon({
    user: 'shop',
    host: process.env.POSTGRES_HOST || 'localhost',
    database: 'shop',
    password: 'shop',
    port: 5432,
});

// Create a new express application instance
const app: express.Application = express();
// Apply body-parsing middleware.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

async function getProducts(ctxt: TransactionContext) {
    const { rows } = await ctxt.client.query('SELECT product_id, product, description, image_name, price FROM products');
    const formattedRows = rows.map((row) => ({
        ...row,
        display_price: (row.price / 100).toFixed(2),
    }));

    return formattedRows;
}

app.get('/api/products', asyncHandler(async (req: Request, res: Response) => {
    const products = await operon.transaction(getProducts, {});
    res.send(products);
}));

async function getProduct(ctxt: TransactionContext, id: number) {
    const { rows } = await ctxt.client.query(`SELECT product_id, product, description, image_name, price FROM products WHERE product_id = $1`, [id]);
    if (rows.length === 0) {
        return null;
    }
    const product = {
        ...rows[0],
        display_price: (rows[0].price / 100).toFixed(2),
    };
    return product;
}

app.get('/api/products/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!Number.isInteger(Number(id))) {
        res.status(400).send('Invalid product ID');
        return;
    }
    const product = await operon.transaction(getProduct, {}, Number(id));
    if (product == null) {
        res.status(500).send('Error');
    } else {
        res.send(product);
    }
}));

async function addToCart(ctxt: TransactionContext, username: string, product_id: string) {
    await ctxt.client.query(`INSERT INTO cart VALUES($1, $2, 1) ON CONFLICT (username, product_id) DO UPDATE SET quantity = cart.quantity + 1`, [username, product_id]);
}

app.post('/api/add_to_cart', asyncHandler(async (req: Request, res: Response) => {
    const {username, product_id} = req.body;
    await operon.transaction(addToCart, {}, username, product_id);
    res.status(200).send('Success');
}));

async function getCart(ctxt: TransactionContext, username: string) {
    const { rows } = await ctxt.client.query(`SELECT product_id, quantity FROM cart WHERE username=$1`, [username]);
    const productDetails = await Promise.all(rows.map(async (row) => ({
        ...await getProduct(ctxt, row.product_id),
        inventory: row.quantity,
    })));
    return productDetails;
}

app.post('/api/get_cart', asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.body;
    const productDetails = await operon.transaction(getCart, {}, username);
    res.send(productDetails);
}));

async function startServer() {
    await operon.initializeOperonTables();
    app.listen(port, () => {
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  
  }
  
  startServer();