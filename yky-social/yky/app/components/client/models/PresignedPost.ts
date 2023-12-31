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
 * @interface PresignedPost
 */
export interface PresignedPost {
    /**
     * 
     * @type {string}
     * @memberof PresignedPost
     */
    url: string;
    /**
     * 
     * @type {{ [key: string]: string; }}
     * @memberof PresignedPost
     */
    fields: { [key: string]: string; };
}

/**
 * Check if a given object implements the PresignedPost interface.
 */
export function instanceOfPresignedPost(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "url" in value;
    isInstance = isInstance && "fields" in value;

    return isInstance;
}

export function PresignedPostFromJSON(json: any): PresignedPost {
    return PresignedPostFromJSONTyped(json, false);
}

export function PresignedPostFromJSONTyped(json: any, ignoreDiscriminator: boolean): PresignedPost {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'url': json['url'],
        'fields': json['fields'],
    };
}

export function PresignedPostToJSON(value?: PresignedPost | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'url': value.url,
        'fields': value.fields,
    };
}

