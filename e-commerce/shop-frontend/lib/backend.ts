import { AsyncReturnType } from "oazapfts";
import * as $api from "./client";

// Utility types to extract the return type of the oazapfts generated function
type DataFieldType<T> = T extends { data: infer U } ? U : never
type ArrayItemType<T> = T extends ReadonlyArray<infer U> ? U : never
type OazapftsReturn<T extends (...args: any) => any> = DataFieldType<AsyncReturnType<T>>

export const backendAddress = "http://localhost:8082";
$api.defaults.baseUrl = backendAddress;

export type CartProduct = ArrayItemType<OazapftsReturn<typeof $api.getCart>>
export type Product = OazapftsReturn<typeof $api.getProduct>


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
