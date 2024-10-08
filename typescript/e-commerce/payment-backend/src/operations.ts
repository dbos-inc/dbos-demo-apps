import {
  TransactionContext, WorkflowContext, Transaction, Workflow, HandlerContext,
  GetApi, PostApi, DBOSResponseError, ArgRequired, ArgOptional, DBOSContext, Step, StepContext, ArgSource, ArgSources, KoaMiddleware
} from '@dbos-inc/dbos-sdk';

import KoaViews from '@ladjs/koa-views';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

export interface SessionTable {
  session_id: string;
  client_reference_id?: string;
  webhook: string;
  success_url: string;
  cancel_url: string;
  status?: string;
}

export interface ItemTable {
  item_id: number;
  description: string;
  quantity: number;
  price: number;
  session_id: string;
}

export const payment_complete_topic = "payment_complete_topic";
export const payment_session_started_topic = "payment_session_started_topic";
export const payment_submitted = "payment.submitted";
export const payment_cancelled = "payment.cancelled";

function getPaymentStatus(status?: string): "pending" | "paid" | "cancelled" {
  if (!status) { return "pending"; }
  return status === payment_submitted ? "paid" : "cancelled";
}

function getRedirectUrl(ctxt: DBOSContext, session_id: string): string {
  const frontend_host = ctxt.getConfig<string>("frontend_host");
  if (!frontend_host) { throw new DBOSResponseError("frontend_host not configured", 500); }

  const url = new URL(frontend_host);
  url.pathname = `/payment/${session_id}`;
  return url.href;
}

export interface PaymentSession {
  session_id: string;
  url: string;
  payment_status: "pending" | "paid" | "cancelled";
}

export type PaymentItem = Pick<ItemTable, "description" | "price" | "quantity">;

export interface PaymentSessionInformation {
  session_id: string;
  success_url: string;
  cancel_url: string;
  status?: string | undefined;
  items: PaymentItem[];
}

@KoaMiddleware(KoaViews(`${__dirname}/../views`, { extension: 'ejs' }))
export class PlaidPayments {
  // UI
  @GetApi('/payment/:session_id')
  static async paymentPage(ctx: HandlerContext, session_id: string) {
    const session = await ctx.invoke(PlaidPayments).getSessionInformationTrans(session_id);
    if (!session) {
      return `Invalid session id ${session_id}`;
    }

    await ctx.koaContext.render('payment', { session });
  }

  @PostApi('/payment/:session_id')
  static async paymentAction(ctx: HandlerContext, @ArgSource(ArgSources.URL) session_id: string) {
    const session = await ctx.invoke(PlaidPayments).getSessionInformationTrans(session_id);
    if (!session) {
      return `Invalid session id ${session_id}`;
    }

    const body = ctx.koaContext.request.body as object;
    const submit = 'submit' in body;
    if (submit) {
      await PlaidPayments.submitPayment(ctx, session_id);
      ctx.koaContext.redirect(session.success_url);
    } else {
      await PlaidPayments.cancelPayment(ctx, session_id);
      ctx.koaContext.redirect(session.cancel_url);
    }
  }

  // API for shop
  @PostApi('/api/create_payment_session')
  static async createPaymentSession(
    ctxt: HandlerContext,
    @ArgRequired webhook: string,
    @ArgRequired success_url: string,
    @ArgRequired cancel_url: string,
    @ArgRequired items: PaymentItem[],
    @ArgOptional client_reference_id?: string
  ): Promise<PaymentSession> {

    if (items.length === 0) {
      throw new DBOSResponseError("items must be non-empty", 404);
    }

    const handle = await ctxt.startWorkflow(PlaidPayments).paymentSession(webhook, success_url, cancel_url, items, client_reference_id);
    const session_id = handle.getWorkflowUUID();
    await ctxt.getEvent(session_id, payment_session_started_topic, 1000);

    return {
      session_id,
      url: getRedirectUrl(ctxt, session_id),
      payment_status: getPaymentStatus(),
    };
  }

  @GetApi('/api/session/:session_id')
  @Transaction({ readOnly: true })
  static async retrievePaymentSession(ctxt: KnexTransactionContext, @ArgSource(ArgSources.URL) session_id: string): Promise<PaymentSession | undefined> {
    const rows = await ctxt.client<SessionTable>('session').select('status').where({ session_id });
    if (rows.length === 0) { return undefined; }

    return {
      session_id,
      url: getRedirectUrl(ctxt, session_id),
      payment_status: getPaymentStatus(rows[0].status),
    };
  }

  // Optional API, used in shop guide and/or unit tests
  @PostApi('/api/submit_payment')
  static async submitPayment(ctxt: HandlerContext, session_id: string) {
    await ctxt.send(session_id, payment_submitted, payment_complete_topic);
  }

  @PostApi('/api/cancel_payment')
  static async cancelPayment(ctxt: HandlerContext, session_id: string) {
    await ctxt.send(session_id, payment_cancelled, payment_complete_topic);
  }

  @GetApi('/api/session_info/:session_id')
  static async getSessionInformation(ctxt: HandlerContext, @ArgSource(ArgSources.URL) session_id: string): Promise<PaymentSessionInformation | undefined> {
    return ctxt.invoke(PlaidPayments).getSessionInformationTrans(session_id);
  }

  @Transaction({ readOnly: true })
  static async getSessionInformationTrans(ctxt: KnexTransactionContext, session_id: string): Promise<PaymentSessionInformation | undefined> {
    ctxt.logger.info(`getting session record ${session_id}`);
    const session = await ctxt.client<SessionTable>('session')
      .select("session_id", "success_url", "cancel_url", "status")
      .where({ session_id })
      .first();
    if (!session) { return undefined; }

    const items = await ctxt.client<ItemTable>('items')
      .select("description", "price", "quantity")
      .where({ session_id });
    return { ...session, items };
  }

  @Workflow()
  static async paymentSession(
    ctxt: WorkflowContext,
    webhook: string,
    success_url: string,
    cancel_url: string,
    items: PaymentItem[],
    @ArgOptional client_ref?: string
  ) {
    const session_id = ctxt.workflowUUID;
    ctxt.logger.info(`creating payment session ${session_id}`);
    await ctxt.invoke(PlaidPayments).insertSession(session_id, webhook, success_url, cancel_url, items, client_ref);
    await ctxt.setEvent(payment_session_started_topic, 'inserted');

    const notification = await ctxt.recv<string>(payment_complete_topic, 60) ?? "payment.error";
    ctxt.logger.info(`payment session ${session_id} new status ${notification}`);
    await ctxt.invoke(PlaidPayments).updateSessionStatus(session_id, notification);

    ctxt.logger.info(`Invoking ${webhook} webhook for session ${session_id} with status ${notification}`);
    await ctxt.invoke(PlaidPayments).paymentWebhook(webhook, session_id, notification, client_ref);
  }

  @Transaction()
  static async insertSession(
    ctxt: KnexTransactionContext,
    session_id: string,
    webhook: string,
    success_url: string,
    cancel_url: string,
    items: PaymentItem[],
    @ArgOptional client_reference_id?: string
  ): Promise<void> {
    await ctxt.client<SessionTable>('session').insert({ session_id, client_reference_id, webhook, success_url, cancel_url });
    for (const item of items) {
      await ctxt.client<ItemTable>('items').insert({ ...item, session_id });
    }
  }

  @Transaction()
  static async updateSessionStatus(
    ctxt: KnexTransactionContext,
    session_id: string,
    status: string
  ): Promise<void> {
    await ctxt.client<SessionTable>('session').where({ session_id }).update({ status });
  }

  @Step()
  static async paymentWebhook(
    ctxt: StepContext,
    webhook: string, 
    session_id: string, 
    status: string | undefined, 
    client_reference_id: string | undefined
  ): Promise<void>
  {
    if (ctxt.getConfig('unittest', false) && webhook === "http://fakehost/webhook") {
      return; // In testing, matching the bogus testing URL
    }
    const body = { session_id, payment_status: getPaymentStatus(status), client_reference_id };

    await fetch(webhook, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)  
    });
  }
}
