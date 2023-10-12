import Koa from 'koa';
import KoaRouter from 'koa-router';

const port = process.env.PORT || 8000;
const payment_backend = process.env.PLAID_BACKEND || 'http://localhost:8086';

const app = new Koa();
const router = new KoaRouter();

export interface PaymentSession {
    session_id: string;
    client_reference_id?: string;
    success_url: string;
    cancel_url: string;
    status?: string;
    items: PaymentSessionItem[];
  }
  
  export interface PaymentSessionItem {
    description: string;
    quantity: number;
    price: number;
  }

async function getPaymentSession(session_id: string): Promise<PaymentSession | undefined> {
    const url = `${payment_backend}/api/session_status/${session_id}`;
    try {
        const resp = await fetch(url);
        if (resp.status !== 200) { return undefined; }
        return await resp.json() as PaymentSession;
    } catch {
        return undefined;
    }
}

router.get('/', async (ctx, next) => {
    ctx.body = 'Plaid Payments';
});

router.get('/payment/:session_id', async (ctx, next) => {
    const session_id = ctx.params['session_id'];
    const session = await getPaymentSession(session_id);
    if (!session) { 
        ctx.body = `Invalid session id ${session_id}`; 
        return; 
    }

    ctx.body = `Plaid Payments ${session.session_id}`;
});

app.use(router.routes());

console.log(`Plaid payment front end running on http://localhost:${port}`);
app.listen(port);