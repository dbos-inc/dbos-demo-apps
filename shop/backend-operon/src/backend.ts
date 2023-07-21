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

async function getProductsWorkflow (ctxt: WorkflowContext) {
    return await ctxt.transaction(getProducts);
}

app.get('/api/products', asyncHandler(async (req: Request, res: Response) => {
    const products = await operon.workflow(getProductsWorkflow, {});
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

async function getProductWorkflow (ctxt: WorkflowContext, id: number) {
    return await ctxt.transaction(getProduct, id);
}


app.get('/api/products/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!Number.isInteger(Number(id))) {
        res.status(400).send('Invalid product ID');
        return;
    }
    const product = await operon.workflow(getProductWorkflow, {}, Number(id));
    if (product == null) {
        res.status(500).send('Error');
    } else {
        res.send(product);
    }
}));

async function startServer() {
    await operon.initializeOperonTables();
    app.listen(port, () => {
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  
  }
  
  startServer();