/* tslint:disable */
/* eslint-disable */
/**
 * social-ts
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * The version of the OpenAPI document: 1.0.0
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
 * @interface DoKeyUpload200Response
 */
export interface DoKeyUpload200Response {
    /**
     * 
     * @type {string}
     * @memberof DoKeyUpload200Response
     */
    message: string;
    /**
     * 
     * @type {string}
     * @memberof DoKeyUpload200Response
     */
    url: string;
    /**
     * 
     * @type {string}
     * @memberof DoKeyUpload200Response
     */
    key: string;
    /**
     * 
     * @type {{ [key: string]: string; }}
     * @memberof DoKeyUpload200Response
     */
    fields: { [key: string]: string; };
}

/**
 * Check if a given object implements the DoKeyUpload200Response interface.
 */
export function instanceOfDoKeyUpload200Response(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "message" in value;
    isInstance = isInstance && "url" in value;
    isInstance = isInstance && "key" in value;
    isInstance = isInstance && "fields" in value;

    return isInstance;
}

export function DoKeyUpload200ResponseFromJSON(json: any): DoKeyUpload200Response {
    return DoKeyUpload200ResponseFromJSONTyped(json, false);
}

export function DoKeyUpload200ResponseFromJSONTyped(json: any, ignoreDiscriminator: boolean): DoKeyUpload200Response {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'message': json['message'],
        'url': json['url'],
        'key': json['key'],
        'fields': json['fields'],
    };
}

export function DoKeyUpload200ResponseToJSON(value?: DoKeyUpload200Response | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'message': value.message,
        'url': value.url,
        'key': value.key,
        'fields': value.fields,
    };
}

