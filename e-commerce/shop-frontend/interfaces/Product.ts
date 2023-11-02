import { AsyncReturnType } from "oazapfts";
import * as $api from "../lib/client";

// Utility types to extract the return type of the oazapfts generated function
type DataFieldType<T> = T extends { data: infer U } ? U : never
type ArrayItemType<T> = T extends ReadonlyArray<infer U> ? U : never
type OazapftsReturn<T extends (...args: any) => any> = DataFieldType<AsyncReturnType<T>>

export type CartProduct = ArrayItemType<OazapftsReturn<typeof $api.getCart>>
export type Product = OazapftsReturn<typeof $api.getProduct>
