/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  TransactionContext, WorkflowContext, OperonTransaction, OperonWorkflow, HandlerContext,
  GetApi, PostApi, OperonCommunicator, CommunicatorContext, OperonResponseError, ArgSource, ArgSources, ArgRequired, ArgOptional
} from '@dbos-inc/operon';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';


type KnexTransactionContext = TransactionContext<Knex>;

interface Session {
  session_id: string;
  client_reference_id: string;
  success_url: string;
  cancel_url: string;
}

interface SessionCreateParams {
  client_ref?: string, 
  success_url: string, 
  cancel_url: string
}

export class PlaidPayments {

  @PostApi('/api/create_payment_session')
  static async createPaymentSession(ctxt: HandlerContext, @ArgRequired success_url: string, @ArgRequired cancel_url: string, @ArgOptional client_ref?: string) {
    const session_id = uuidv4();
    // await ctxt.invoke(PlaidPayments).paymentSession(session_id, client_ref, success_url, cancel_url);

    const frontend_host = ctxt.getConfig("frontend_host") as string | undefined | null;
    if (!frontend_host) { throw new OperonResponseError("frontend_host not configured", 500); }

    const url = new URL(frontend_host);
    url.pathname = `/payment/${session_id}`;
    return {
      session_id,
      url: url.href,
      payment_status: "pending"
    }
  }

  @GetApi('/api/session_status')
  static async getSessionStatus(ctxt: HandlerContext, session_id: string) {

  }

  @PostApi('/api/submit_payment')
  static async submitPayment(ctxt: HandlerContext, session_id: string) {

  }

  @PostApi('/api/cancel_payment')
  static async cancelPayment(ctxt: HandlerContext, session_id: string) {

  }





  @OperonWorkflow()
  static async paymentSession(ctxt: WorkflowContext, session_id: string, client_ref: string, success_url: string, cancel_url: string) {


  }

  @OperonTransaction()
  static async insertNewSessionRecord(ctxt: KnexTransactionContext, session_id: string, client_ref: string, success_url: string, cancel_url: string): Promise<void> {

    await ctxt.client<Session>('session').insert({ session_id, client_reference_id: client_ref, success_url, cancel_url });

  }






}
