import Koa from 'koa';
import KoaRouter from 'koa-router';
import KoaViews from '@ladjs/koa-views';
import { bodyParser as KoaBodyParser } from '@koa/bodyparser';
import { DefaultApi, GetSessionInformation200Response as PaymentSessionInformation } from './client/api';

const port = process.env.PORT || 8000;
const basePath = process.env.PLAID_BACKEND || 'http://localhost:8086';

const api = new DefaultApi(basePath);

const app = new Koa();
const router = new KoaRouter();
app.use(KoaBodyParser());
app.use(KoaViews(`${__dirname}/../views`, { extension: 'ejs' }));

async function getPaymentSessionInfo(sessionId: string): Promise<PaymentSessionInformation | undefined> {
    try {
        const result = await api.getSessionInformation(sessionId);
        return result.body;
    } catch {
        return undefined;
    }
}

async function submitPayment(sessionId: string): Promise<void> {
    await api.submitPayment({ sessionId });
}

async function cancelPayment(sessionId: string): Promise<void> {
    await api.cancelPayment({ sessionId });
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
        ctx.redirect(session.successUrl);
    } else {
        await cancelPayment(session_id);
        ctx.redirect(session.cancelUrl);
    }
});

app.use(router.routes());

console.log(`Plaid payment front end running on http://localhost:${port}`);
app.listen(port);