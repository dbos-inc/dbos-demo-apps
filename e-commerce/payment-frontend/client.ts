/**
 * operon-demo-payment-backend
 * private
 * DO NOT MODIFY - This file has been generated using oazapfts.
 * See https://www.npmjs.com/package/oazapfts
 */
import * as Oazapfts from "oazapfts/lib/runtime";
import * as QS from "oazapfts/lib/runtime/query";
export const defaults: Oazapfts.RequestOpts = {
    baseUrl: "/",
};
const oazapfts = Oazapfts.runtime(defaults);
export const servers = {};
export type PaymentItem = {
    description: string;
    price: number;
    quantity: number;
};
export function createPaymentSession(body: {
    webhook: string;
    success_url: string;
    cancel_url: string;
    items: PaymentItem[];
    client_reference_id?: string;
}, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchJson<{
        status: 200;
        data: {
            session_id: string;
            url: string;
            payment_status: "pending" | "paid" | "cancelled";
        };
    }>("/api/create_payment_session", oazapfts.json({
        ...opts,
        method: "POST",
        body,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    }));
}
export function retrievePaymentSession(sessionId: string, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchJson<{
        status: 200;
        data: {
            session_id: string;
            url: string;
            payment_status: "pending" | "paid" | "cancelled";
        };
    }>(`/api/session/${encodeURIComponent(sessionId)}`, {
        ...opts,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    });
}
export function getSessionInformation(sessionId: string, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchJson<{
        status: 200;
        data: {
            session_id: string;
            success_url: string;
            cancel_url: string;
            status?: string;
            items: PaymentItem[];
        };
    }>(`/api/session_info/${encodeURIComponent(sessionId)}`, {
        ...opts,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    });
}
export function submitPayment(body: {
    session_id: string;
}, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText("/api/submit_payment", oazapfts.json({
        ...opts,
        method: "POST",
        body,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    }));
}
export function cancelPayment(body: {
    session_id: string;
}, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText("/api/cancel_payment", oazapfts.json({
        ...opts,
        method: "POST",
        body,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    }));
}
