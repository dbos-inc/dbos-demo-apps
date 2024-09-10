import * as $api from "./client";

// utility type to return the data field of a type
type DataFieldType<T> = T extends { data: infer U } ? U : never
// utility type to return an array's item type
type ArrayItemType<T> = T extends ReadonlyArray<infer U> ? U : never
// utility type to return the data type of an Oazapfts api function return type
type OazapftsReturn<T extends (...args: any) => any> = DataFieldType<Awaited<ReturnType<T>>>

export const backendAddress = process.env.NEXT_PUBLIC_SHOP_BACKEND || "http://localhost:8082";
$api.defaults.baseUrl = backendAddress;

export type CartProduct = ArrayItemType<OazapftsReturn<typeof $api.getCart>>
export type Product = OazapftsReturn<typeof $api.getProduct>

// hide defaults and servers from publicly exported api object
export const api: Omit<typeof $api, 'defaults' | 'servers'> = $api;
