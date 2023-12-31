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
 * @interface DoLoginRequest
 */
export interface DoLoginRequest {
    /**
     * 
     * @type {string}
     * @memberof DoLoginRequest
     */
    username: string;
    /**
     * 
     * @type {string}
     * @memberof DoLoginRequest
     */
    password: string;
}

/**
 * Check if a given object implements the DoLoginRequest interface.
 */
export function instanceOfDoLoginRequest(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "username" in value;
    isInstance = isInstance && "password" in value;

    return isInstance;
}

export function DoLoginRequestFromJSON(json: any): DoLoginRequest {
    return DoLoginRequestFromJSONTyped(json, false);
}

export function DoLoginRequestFromJSONTyped(json: any, ignoreDiscriminator: boolean): DoLoginRequest {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'username': json['username'],
        'password': json['password'],
    };
}

export function DoLoginRequestToJSON(value?: DoLoginRequest | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'username': value.username,
        'password': value.password,
    };
}

