import Koa from 'koa';
import KoaRouter from 'koa-router';
import KoaViews from '@ladjs/koa-views';
import { bodyParser as KoaBodyParser } from '@koa/bodyparser';


const port = process.env.PORT || 8000;
const payment_backend = process.env.PLAID_BACKEND || 'http://localhost:8086';

const app = new Koa();
const router = new KoaRouter();
app.use(KoaBodyParser());
app.use(KoaViews(`${__dirname}/../views`, { extension: 'ejs' }));

export interface PaymentSessionInformation {
    session_id: string;
    success_url: string;
    cancel_url: string;
    status?: string | undefined;
    items: PaymentItem[];
  }
export interface PaymentItem {
    description: string;
    quantity: number;
    price: number;
}

async function getPaymentSessionInfo(session_id: string): Promise<PaymentSessionInformation | undefined> {
    const url = `${payment_backend}/api/session_info/${session_id}`;
    try {
        const resp = await fetch(url);
        if (resp.status !== 200) { return undefined; }
        return await resp.json() as PaymentSessionInformation;
    } catch {
        return undefined;
    }
}

async function submitPayment(session_id: string): Promise<void> {
    const url = `${payment_backend}/api/submit_payment`;
    await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ session_id })
    })
}


async function cancelPayment(session_id: string): Promise<void> {
    const url = `${payment_backend}/api/cancel_payment`;
    await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ session_id })
    })
}

router.get('/', async (ctx, next) => {
    ctx.body = 'Plaid Payments';
});

router.get('/payment/:session_id', async (ctx, next) => {
    const session_id = ctx.params['session_id'];
    const session = await getPaymentSessionInfo(session_id);
    if (!session) {
        ctx.body = `Invalid session id ${session_id}`;
        return;
    }

    await ctx.render('payment', { session });
});

router.post('/payment/:session_id', async (ctx, next) => {
    const session_id = ctx.params['session_id'];
    const session = await getPaymentSessionInfo(session_id);
    if (!session) {
        ctx.body = `Invalid session id ${session_id}`;
        return;
    }

    const submit = 'submit' in ctx.request.body;
    if (submit) {
        await submitPayment(session_id);
        ctx.redirect(session.success_url);
    } else {
        await cancelPayment(session_id);
        ctx.redirect(session.cancel_url);
    }
});

app.use(router.routes());

console.log(`Plaid payment front end running on http://localhost:${port}`);
app.listen(port);