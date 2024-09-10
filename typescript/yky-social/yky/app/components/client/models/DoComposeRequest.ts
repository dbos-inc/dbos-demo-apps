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
 * @interface DoComposeRequest
 */
export interface DoComposeRequest {
    /**
     * 
     * @type {string}
     * @memberof DoComposeRequest
     */
    postText: string;
}

/**
 * Check if a given object implements the DoComposeRequest interface.
 */
export function instanceOfDoComposeRequest(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "postText" in value;

    return isInstance;
}

export function DoComposeRequestFromJSON(json: any): DoComposeRequest {
    return DoComposeRequestFromJSONTyped(json, false);
}

export function DoComposeRequestFromJSONTyped(json: any, ignoreDiscriminator: boolean): DoComposeRequest {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'postText': json['postText'],
    };
}

export function DoComposeRequestToJSON(value?: DoComposeRequest | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'postText': value.postText,
    };
}
