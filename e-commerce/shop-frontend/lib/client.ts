/**
 * operon-demo-shop-backend
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
export function login(body: {
    username: string;
    password: string;
}, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText("/api/login", oazapfts.json({
        ...opts,
        method: "POST",
        body,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    }));
}
export function register(body: {
    username: string;
    password: string;
}, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText("/api/register", oazapfts.json({
        ...opts,
        method: "POST",
        body,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    }));
}
export function getProducts({ operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchJson<{
        status: 200;
        data: {
            display_price: string;
            product_id: number;
            product: string;
            description: string;
            image_name: string;
            price: number;
        }[];
    }>("/api/products", {
        ...opts,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    });
}
export function getProduct(id: number, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchJson<{
        status: 200;
        data: {
            display_price: string;
            product_id: number;
            product: string;
            description: string;
            image_name: string;
            price: number;
        };
    }>(`/api/products/${encodeURIComponent(id)}`, {
        ...opts,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    });
}
export function addToCart(body: {
    username: string;
    product_id: number;
}, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText("/api/add_to_cart", oazapfts.json({
        ...opts,
        method: "POST",
        body,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    }));
}
export function getCart(body: {
    username: string;
}, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchJson<{
        status: 200;
        data: {
            display_price: string;
            product_id: number;
            product: string;
            description: string;
            image_name: string;
            price: number;
            inventory: number;
        }[];
    }>("/api/get_cart", oazapfts.json({
        ...opts,
        method: "POST",
        body,
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    }));
}
export function webCheckout(username: string, { operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText(`/api/checkout_session${QS.query(QS.explode({
        username
    }))}`, {
        ...opts,
        method: "POST",
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    });
}
export function paymentWebhook({ operonWorkflowuuid }: {
    operonWorkflowuuid?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText("/payment_webhook", {
        ...opts,
        method: "POST",
        headers: {
            ...opts && opts.headers,
            "operon-workflowuuid": operonWorkflowuuid
        }
    });
}
