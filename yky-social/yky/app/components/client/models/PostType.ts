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


/**
 * 
 * @export
 */
export const PostType = {
    NUMBER_0: 0,
    NUMBER_1: 1,
    NUMBER_2: 2,
    NUMBER_3: 3
} as const;
export type PostType = typeof PostType[keyof typeof PostType];


export function PostTypeFromJSON(json: any): PostType {
    return PostTypeFromJSONTyped(json, false);
}

export function PostTypeFromJSONTyped(json: any, ignoreDiscriminator: boolean): PostType {
    return json as PostType;
}

export function PostTypeToJSON(value?: PostType | null): any {
    return value as any;
}

