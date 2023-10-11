/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  TransactionContext, WorkflowContext, OperonTransaction, OperonWorkflow, HandlerContext,
  GetApi, PostApi, OperonCommunicator, CommunicatorContext, OperonResponseError, ArgSource, ArgSources, ArgRequired, ArgOptional
} from '@dbos-inc/operon';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';


type KnexTransactionContext = TransactionContext<Knex>;

export interface Session {
  session_id: string;
  client_reference_id: string;
  success_url: string;
  cancel_url: string;
}

interface SessionCreateParams {
  client_reference_id?: string, 
  success_url: string, 
  cancel_url: string
}

export class PlaidPayments {

  @PostApi('/api/create_payment_session')
  static async createPaymentSession(
    ctxt: HandlerContext, 
    @ArgRequired success_url: string, 
    @ArgRequired cancel_url: string, 
    @ArgOptional client_reference_id?: string
  ): Promise<{ session_id: string; url: string; payment_status: string; }> {
    // BUG: when operon serializes WF input parameters, undefined is converted to null. 
    // Data validation logic needs to be updated to allow optional args to be null or undefined
    // TODO: remove the workaround of converting falsy ref id -> empty string
    const handle = await ctxt.invoke(PlaidPayments).paymentSession(success_url, cancel_url, client_reference_id ?? '');
    // BUG: getWorkflowUUID should be a property not a get method
    const session_id = handle.getWorkflowUUID();

    const frontend_host = ctxt.getConfig("frontend_host") as string | undefined | null;
    if (!frontend_host) { throw new OperonResponseError("frontend_host not configured", 500); }

    const url = new URL(frontend_host);
    url.pathname = `/payment/${session_id}`;
    return {
      session_id,
      url: url.href,
      payment_status: "pending"
    };
  }

  @GetApi('/api/session_status')
  @OperonTransaction({readOnly: true})
  static async getSessionRecord(ctxt: KnexTransactionContext, session_id: string): Promise<Session | undefined> {
    return await ctxt.client<Session>('session').where({ session_id }).first();
  }

  @PostApi('/api/submit_payment')
  static async submitPayment(ctxt: HandlerContext, session_id: string) {
    await ctxt.send(session_id, "payment.submitted", "payment_complete_topic");


  }

  @PostApi('/api/cancel_payment')
  static async cancelPayment(ctxt: HandlerContext, session_id: string) {
    await ctxt.send(session_id, "payment.cancelled", "payment_complete_topic");
  }





  @OperonWorkflow()
  static async paymentSession(ctxt: WorkflowContext, success_url: string, cancel_url: string, @ArgOptional client_ref?: string) {
    const session_id = ctxt.workflowUUID;
    await ctxt.invoke(PlaidPayments).insertNewSessionRecord(session_id, success_url, cancel_url, client_ref);


  }

  @OperonTransaction()
  static async insertNewSessionRecord(ctxt: KnexTransactionContext, session_id: string, success_url: string, cancel_url: string, @ArgOptional client_ref?: string): Promise<void> {
    await ctxt.client<Session>('session').insert({ session_id, client_reference_id: client_ref, success_url, cancel_url });
  }


}
