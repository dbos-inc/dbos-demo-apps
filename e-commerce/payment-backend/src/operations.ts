import {
  TransactionContext, WorkflowContext, OperonTransaction, OperonWorkflow, HandlerContext,
  GetApi, PostApi, OperonResponseError, ArgRequired, ArgOptional
} from '@dbos-inc/operon';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

export interface SessionTable {
  session_id: string;
  client_reference_id?: string;
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

export class PlaidPayments {

  @PostApi('/api/create_payment_session')
  static async createPaymentSession(
    ctxt: HandlerContext, 
    @ArgRequired success_url: string, 
    @ArgRequired cancel_url: string, 
    @ArgRequired items: PaymentItem[],
    @ArgOptional client_reference_id?: string
  ): Promise<{ session_id: string; url: string; }> {

    if (items.length === 0) {
      throw new OperonResponseError("items must be non-empty", 404);
    }

    // BUG: when operon serializes WF input parameters, undefined is converted to null. 
    // Data validation logic needs to be updated to allow optional args to be null or undefined
    // TODO: remove the workaround of converting falsy ref id -> empty string
    const handle = await ctxt.invoke(PlaidPayments).paymentSession(success_url, cancel_url, items, client_reference_id ?? '');

    // BUG: getWorkflowUUID should be a property not a get method
    const session_id = handle.getWorkflowUUID();

    const frontend_host = ctxt.getConfig("frontend_host") as string | undefined | null;
    if (!frontend_host) { throw new OperonResponseError("frontend_host not configured", 500); }

    const url = new URL(frontend_host);
    url.pathname = `/payment/${session_id}`;

    return {
      session_id,
      url: url.href
    };
  }

  @GetApi('/api/session_status')
  @OperonTransaction({readOnly: true})
  static async getSessionRecord(ctxt: KnexTransactionContext, session_id: string): Promise<PaymentSession | undefined> {
    const session = await ctxt.client<SessionTable>('session').where({ session_id }).first();
    if (!session) { return undefined; }

    const items: PaymentItem[] = await ctxt.client<ItemTable>('items').select("description", "price", "quantity").where({ session_id });
    return { ...session, items};
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
  static async paymentSession(ctxt: WorkflowContext, success_url: string, cancel_url: string, items: PaymentItem[], @ArgOptional client_ref?: string) {
    const session_id = ctxt.workflowUUID;
    await ctxt.invoke(PlaidPayments).insertSession(session_id, success_url, cancel_url, items, client_ref);
    const notification = await ctxt.recv<string>(payment_complete_topic, 60) ?? "payment.error";
    await ctxt.invoke(PlaidPayments).updateSessionStatus(session_id, notification);
    //TODO: send payment status update to shop
  }

  @OperonTransaction()
  static async insertSession(ctxt: KnexTransactionContext, session_id: string, success_url: string, cancel_url: string, items: PaymentItem[], @ArgOptional client_ref?: string): Promise<void> {
    await ctxt.client<SessionTable>('session').insert({ session_id, client_reference_id: client_ref, success_url, cancel_url });
    for (const item of items) {
      await ctxt.client<ItemTable>('items').insert({ ...item, session_id});
    }
  }

  @OperonTransaction()
  static async updateSessionStatus(ctxt: KnexTransactionContext, session_id: string, status: string): Promise<void> {
    await ctxt.client<SessionTable>('session').where({ session_id }).update({ status });
  }
}
