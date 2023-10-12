import {
  TransactionContext, WorkflowContext, OperonTransaction, OperonWorkflow, HandlerContext,
  GetApi, PostApi, OperonResponseError, ArgRequired, ArgOptional, OperonContext, OperonCommunicator, CommunicatorContext
} from '@dbos-inc/operon';
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
export const payment_submitted = "payment.submitted";
export const payment_cancelled = "payment.cancelled";

export type PaymentItem = Omit<ItemTable, 'item_id' | 'session_id'>;
export type PaymentSession = SessionTable & { items: PaymentItem[]; };
export type Session = { session_id: string; url?: string; payment_status: string };

export class PlaidPayments {

  @PostApi('/api/create_payment_session')
  static async createPaymentSession(
    ctxt: HandlerContext,
    @ArgRequired webhook: string,
    @ArgRequired success_url: string,
    @ArgRequired cancel_url: string,
    @ArgRequired items: PaymentItem[],
    @ArgOptional client_reference_id?: string
  ): Promise<Session> {

    if (items.length === 0) {
      throw new OperonResponseError("items must be non-empty", 404);
    }

    const handle = await ctxt.invoke(PlaidPayments).paymentSession(webhook, success_url, cancel_url, items, client_reference_id);
    const session_id = handle.getWorkflowUUID();

    return {
      session_id,
      url: PlaidPayments.getRedirectUrl(ctxt, session_id),
      payment_status: "pending"
    };
  }

  static getRedirectUrl(ctxt: OperonContext, session_id: string) {
    const frontend_host = ctxt.getConfig("frontend_host") as string | undefined | null;
    if (!frontend_host) { throw new OperonResponseError("frontend_host not configured", 500); }

    const url = new URL(frontend_host);
    url.pathname = `/payment/${session_id}`;
    return url.href;
  }

  @GetApi('/api/session/:session_id')
  @OperonTransaction({ readOnly: true })
  static async retrievePaymentSession(ctxt: KnexTransactionContext, session_id: string): Promise<Session | undefined> {
    const rows = await ctxt.client<SessionTable>('session').select('status').where({ session_id });
    if (rows.length === 0) { return undefined; }

    return {
      session_id,
      url: PlaidPayments.getRedirectUrl(ctxt, session_id),
      payment_status: rows[0].status ?? "pending"
    }
  }







  @GetApi('/api/session_status/:session_id')
  @OperonTransaction({ readOnly: true })
  static async getSessionRecord(ctxt: KnexTransactionContext, session_id: string): Promise<PaymentSession | undefined> {
    ctxt.logger.info(`getting session record ${session_id}`);
    const session = await ctxt.client<SessionTable>('session').where({ session_id }).first();
    if (!session) { return undefined; }

    const items: PaymentItem[] = await ctxt.client<ItemTable>('items').select("description", "price", "quantity").where({ session_id });
    return { ...session, items };
  }

  @PostApi('/api/submit_payment')
  static async submitPayment(ctxt: HandlerContext, session_id: string) {
    await ctxt.send(session_id, payment_submitted, payment_complete_topic);
  }

  @PostApi('/api/cancel_payment')
  static async cancelPayment(ctxt: HandlerContext, session_id: string) {
    await ctxt.send(session_id, payment_cancelled, payment_complete_topic);
  }

  @OperonWorkflow()
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

    const notification = await ctxt.recv<string>(payment_complete_topic, 60) ?? "payment.error";
    ctxt.logger.info(`payment session ${session_id} new status ${notification}`);
    await ctxt.invoke(PlaidPayments).updateSessionStatus(session_id, notification);

    ctxt.logger.info(`Invoking ${webhook} webhook for session ${session_id} with status ${notification}`);
    await ctxt.invoke(PlaidPayments).paymentWebhook(webhook, session_id, notification, client_ref);
  }

  @OperonTransaction()
  static async insertSession(
    ctxt: KnexTransactionContext,
    session_id: string,
    webhook: string,
    success_url: string,
    cancel_url: string,
    items: PaymentItem[],
    @ArgOptional client_ref?: string
  ): Promise<void> {
    await ctxt.client<SessionTable>('session').insert({ session_id, client_reference_id: client_ref, webhook, success_url, cancel_url });
    for (const item of items) {
      await ctxt.client<ItemTable>('items').insert({ ...item, session_id });
    }
  }

  @OperonTransaction()
  static async updateSessionStatus(
    ctxt: KnexTransactionContext,
    session_id: string,
    status: string
  ): Promise<void> {
    await ctxt.client<SessionTable>('session').where({ session_id }).update({ status });
  }

  @OperonCommunicator()
  static async paymentWebhook(ctxt: CommunicatorContext, webhook: string, session_id: string, payment_status: string, client_reference_id: string | undefined): Promise<void> {
    const body = { session_id, payment_status, client_reference_id };

    await fetch(webhook, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)  
    })
  }
}
