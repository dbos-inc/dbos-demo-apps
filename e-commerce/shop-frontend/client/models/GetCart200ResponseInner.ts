/* tslint:disable */
/* eslint-disable */
/**
 * operon-demo-shop-backend
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * The version of the OpenAPI document: private
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import { exists, mapValues } from '../runtime';
/**
 * 
 * @export
 * @interface GetCart200ResponseInner
 */
export interface GetCart200ResponseInner {
    /**
     * 
     * @type {string}
     * @memberof GetCart200ResponseInner
     */
    displayPrice: string;
    /**
     * 
     * @type {number}
     * @memberof GetCart200ResponseInner
     */
    productId: number;
    /**
     * 
     * @type {string}
     * @memberof GetCart200ResponseInner
     */
    product: string;
    /**
     * 
     * @type {string}
     * @memberof GetCart200ResponseInner
     */
    description: string;
    /**
     * 
     * @type {string}
     * @memberof GetCart200ResponseInner
     */
    imageName: string;
    /**
     * 
     * @type {number}
     * @memberof GetCart200ResponseInner
     */
    price: number;
    /**
     * 
     * @type {number}
     * @memberof GetCart200ResponseInner
     */
    inventory: number;
}

/**
 * Check if a given object implements the GetCart200ResponseInner interface.
 */
export function instanceOfGetCart200ResponseInner(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "displayPrice" in value;
    isInstance = isInstance && "productId" in value;
    isInstance = isInstance && "product" in value;
    isInstance = isInstance && "description" in value;
    isInstance = isInstance && "imageName" in value;
    isInstance = isInstance && "price" in value;
    isInstance = isInstance && "inventory" in value;

    return isInstance;
}

export function GetCart200ResponseInnerFromJSON(json: any): GetCart200ResponseInner {
    return GetCart200ResponseInnerFromJSONTyped(json, false);
}

export function GetCart200ResponseInnerFromJSONTyped(json: any, ignoreDiscriminator: boolean): GetCart200ResponseInner {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'displayPrice': json['display_price'],
        'productId': json['product_id'],
        'product': json['product'],
        'description': json['description'],
        'imageName': json['image_name'],
        'price': json['price'],
        'inventory': json['inventory'],
    };
}

export function GetCart200ResponseInnerToJSON(value?: GetCart200ResponseInner | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'display_price': value.displayPrice,
        'product_id': value.productId,
        'product': value.product,
        'description': value.description,
        'image_name': value.imageName,
        'price': value.price,
        'inventory': value.inventory,
    };
}
