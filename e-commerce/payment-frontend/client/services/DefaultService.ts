/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PaymentItem } from '../models/PaymentItem';

import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';

export class DefaultService {

    constructor(public readonly httpRequest: BaseHttpRequest) {}

    /**
     * @param requestBody
     * @param operonWorkflowuuid Caller specified [Operon idempotency key](https://docs.dbos.dev/tutorials/idempotency-tutorial#setting-idempotency-keys)
     * @returns any Ok
     * @throws ApiError
     */
    public createPaymentSession(
        requestBody: {
            webhook: string;
            success_url: string;
            cancel_url: string;
            items: Array<PaymentItem>;
            client_reference_id?: string;
        },
        operonWorkflowuuid?: string,
    ): CancelablePromise<{
        session_id: string;
        url: string;
        payment_status: 'pending' | 'paid' | 'cancelled';
    }> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/create_payment_session',
            headers: {
                'operon-workflowuuid': operonWorkflowuuid,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }

    /**
     * @param sessionId
     * @param operonWorkflowuuid Caller specified [Operon idempotency key](https://docs.dbos.dev/tutorials/idempotency-tutorial#setting-idempotency-keys)
     * @returns any Ok
     * @throws ApiError
     */
    public retrievePaymentSession(
        sessionId: string,
        operonWorkflowuuid?: string,
    ): CancelablePromise<{
        session_id: string;
        url: string;
        payment_status: 'pending' | 'paid' | 'cancelled';
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/session/{session_id}',
            path: {
                'session_id': sessionId,
            },
            headers: {
                'operon-workflowuuid': operonWorkflowuuid,
            },
        });
    }

    /**
     * @param sessionId
     * @param operonWorkflowuuid Caller specified [Operon idempotency key](https://docs.dbos.dev/tutorials/idempotency-tutorial#setting-idempotency-keys)
     * @returns any Ok
     * @throws ApiError
     */
    public getSessionInformation(
        sessionId: string,
        operonWorkflowuuid?: string,
    ): CancelablePromise<{
        session_id: string;
        success_url: string;
        cancel_url: string;
        status?: string;
        items: Array<PaymentItem>;
    }> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/session_info/{session_id}',
            path: {
                'session_id': sessionId,
            },
            headers: {
                'operon-workflowuuid': operonWorkflowuuid,
            },
        });
    }

    /**
     * @param requestBody
     * @param operonWorkflowuuid Caller specified [Operon idempotency key](https://docs.dbos.dev/tutorials/idempotency-tutorial#setting-idempotency-keys)
     * @returns void
     * @throws ApiError
     */
    public submitPayment(
        requestBody: {
            session_id: string;
        },
        operonWorkflowuuid?: string,
    ): CancelablePromise<void> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/submit_payment',
            headers: {
                'operon-workflowuuid': operonWorkflowuuid,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }

    /**
     * @param requestBody
     * @param operonWorkflowuuid Caller specified [Operon idempotency key](https://docs.dbos.dev/tutorials/idempotency-tutorial#setting-idempotency-keys)
     * @returns void
     * @throws ApiError
     */
    public cancelPayment(
        requestBody: {
            session_id: string;
        },
        operonWorkflowuuid?: string,
    ): CancelablePromise<void> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/cancel_payment',
            headers: {
                'operon-workflowuuid': operonWorkflowuuid,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }

}
