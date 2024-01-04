import Koa from 'koa';
import KoaRouter from 'koa-router';
import KoaViews from '@ladjs/koa-views';
import { bodyParser as KoaBodyParser } from '@koa/bodyparser';
import { PaymentClient } from './client';

const port = process.env.PORT || 8000;
const basePath = process.env.PLAID_BACKEND || 'http://localhost:8086';
// const basePath = 'https://mj.cloud.dbos.dev/dbos-testuser/application/payment-backend' ;

const client = new PaymentClient({ BASE: basePath});
const api = client.default;

const app = new Koa();
const router = new KoaRouter();
app.use(KoaBodyParser());
app.use(KoaViews(`${__dirname}/../views`, { extension: 'ejs' }));

type PaymentSessionInformation = Awaited<ReturnType<typeof api.getSessionInformation>>

async function getPaymentSessionInfo(sessionId: string): Promise<PaymentSessionInformation | undefined> {
    try {
        return await api.getSessionInformation(sessionId);
    } catch {
        return undefined;
    }
}

async function submitPayment(session_id: string): Promise<void> {
    await api.submitPayment({ session_id });
}

async function cancelPayment(session_id: string): Promise<void> {
    await api.cancelPayment({ session_id });
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