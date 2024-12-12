import {
  DBOS, DBOSResponseError, ArgRequired, ArgOptional, ArgSource, ArgSources, KoaMiddleware
} from '@dbos-inc/dbos-sdk';

import KoaViews from '@ladjs/koa-views';

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

function getRedirectUrl(session_id: string): string {
  const frontend_host = DBOS.getConfig<string>("frontend_host");
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
  @DBOS.getApi('/payment/:session_id')
  static async paymentPage(session_id: string) {
    const session = await PlaidPayments.getSessionInformationTrans(session_id);
    if (!session) {
      return `Invalid session id ${session_id}`;
    }

    await DBOS.koaContext.render('payment', { session });
  }

  @DBOS.postApi('/payment/:session_id')
  static async paymentAction(@ArgSource(ArgSources.URL) session_id: string) {
    const session = await PlaidPayments.getSessionInformationTrans(session_id);
    if (!session) {
      return `Invalid session id ${session_id}`;
    }

    const body = DBOS.koaContext.request.body as object;
    const submit = 'submit' in body;
    if (submit) {
      await PlaidPayments.submitPayment(session_id);
      DBOS.koaContext.redirect(session.success_url);
    } else {
      await PlaidPayments.cancelPayment(session_id);
      DBOS.koaContext.redirect(session.cancel_url);
    }
  }

  // API for shop
  @DBOS.postApi('/api/create_payment_session')
  static async createPaymentSession(
    @ArgRequired webhook: string,
    @ArgRequired success_url: string,
    @ArgRequired cancel_url: string,
    @ArgRequired items: PaymentItem[],
    @ArgOptional client_reference_id?: string
  ): Promise<PaymentSession> {

    if (items.length === 0) {
      throw new DBOSResponseError("items must be non-empty", 404);
    }

    const handle = await DBOS.startWorkflow(PlaidPayments).paymentSession(webhook, success_url, cancel_url, items, client_reference_id);
    const session_id = handle.getWorkflowUUID();
    await DBOS.getEvent(session_id, payment_session_started_topic, 1000);

    return {
      session_id,
      url: getRedirectUrl(session_id),
      payment_status: getPaymentStatus(),
    };
  }

  @DBOS.getApi('/api/session/:session_id')
  @DBOS.transaction({ readOnly: true })
  static async retrievePaymentSession(@ArgSource(ArgSources.URL) session_id: string): Promise<PaymentSession | undefined> {
    const rows = await DBOS.knexClient<SessionTable>('session').select('status').where({ session_id });
    if (rows.length === 0) { return undefined; }

    return {
      session_id,
      url: getRedirectUrl(session_id),
      payment_status: getPaymentStatus(rows[0].status),
    };
  }

  // Optional API, used in shop guide and/or unit tests
  @DBOS.postApi('/api/submit_payment')
  static async submitPayment(session_id: string) {
    await DBOS.send(session_id, payment_submitted, payment_complete_topic);
  }

  @DBOS.postApi('/api/cancel_payment')
  static async cancelPayment(session_id: string) {
    await DBOS.send(session_id, payment_cancelled, payment_complete_topic);
  }

  @DBOS.getApi('/api/session_info/:session_id')
  static async getSessionInformation(@ArgSource(ArgSources.URL) session_id: string): Promise<PaymentSessionInformation | undefined> {
    return await PlaidPayments.getSessionInformationTrans(session_id);
  }

  @DBOS.transaction({ readOnly: true })
  static async getSessionInformationTrans(session_id: string): Promise<PaymentSessionInformation | undefined> {
    DBOS.logger.info(`getting session record ${session_id}`);
    const session = await DBOS.knexClient<SessionTable>('session')
      .select("session_id", "success_url", "cancel_url", "status")
      .where({ session_id })
      .first();
    if (!session) { return undefined; }

    const items = await DBOS.knexClient<ItemTable>('items')
      .select("description", "price", "quantity")
      .where({ session_id });
    return { ...session, items };
  }

  @DBOS.workflow()
  static async paymentSession(
    webhook: string,
    success_url: string,
    cancel_url: string,
    items: PaymentItem[],
    @ArgOptional client_ref?: string
  ) {
    const session_id = DBOS.workflowID!;
    DBOS.logger.info(`creating payment session ${session_id}`);
    await PlaidPayments.insertSession(session_id, webhook, success_url, cancel_url, items, client_ref);
    await DBOS.setEvent(payment_session_started_topic, 'inserted');

    const notification = await DBOS.recv<string>(payment_complete_topic, 60) ?? "payment.error";
    DBOS.logger.info(`payment session ${session_id} new status ${notification}`);
    await PlaidPayments.updateSessionStatus(session_id, notification);

    DBOS.logger.info(`Invoking ${webhook} webhook for session ${session_id} with status ${notification}`);
    await PlaidPayments.paymentWebhook(webhook, session_id, notification, client_ref);
  }

  @DBOS.transaction()
  static async insertSession(
    session_id: string,
    webhook: string,
    success_url: string,
    cancel_url: string,
    items: PaymentItem[],
    @ArgOptional client_reference_id?: string
  ): Promise<void> {
    await DBOS.knexClient<SessionTable>('session').insert({ session_id, client_reference_id, webhook, success_url, cancel_url });
    for (const item of items) {
      await DBOS.knexClient<ItemTable>('items').insert({ ...item, session_id });
    }
  }

  @DBOS.transaction()
  static async updateSessionStatus(
    session_id: string,
    status: string
  ): Promise<void> {
    await DBOS.knexClient<SessionTable>('session').where({ session_id }).update({ status });
  }

  @DBOS.step()
  static async paymentWebhook(
    webhook: string, 
    session_id: string, 
    status: string | undefined, 
    client_reference_id: string | undefined
  ): Promise<void>
  {
    if (DBOS.getConfig('unittest', false) && webhook === "http://fakehost/webhook") {
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
