import * as $api from "./client";

export const backendAddress = "http://localhost:8082";
$api.defaults.baseUrl = backendAddress;


export const api = {
    addToCart: $api.addToCart,
    getCart: $api.getCart,
    getProduct: $api.getProduct,
    getProducts: $api.getProducts,
    login: $api.login,
    paymentWebhook: $api.paymentWebhook,
    register: $api.register,
    webCheckout: $api.webCheckout,
}
