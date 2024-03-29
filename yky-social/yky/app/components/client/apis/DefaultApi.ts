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


import * as runtime from '../runtime';
import type {
  DoComposeRequest,
  DoFindUser200Response,
  DoFollowRequest,
  DoKeyDownload200Response,
  DoKeyUpload200Response,
  DoLogin200Response,
  DoLoginRequest,
  DoMediaDelete200Response,
  DoRegisterRequest,
  DoStartMediaUpload200Response,
  GetPost200Response,
  GetProfilePhoto200Response,
  Hello200Response,
  ReceiveTimeline200Response,
  SendTimeline200Response,
} from '../models/index';
import {
    DoComposeRequestFromJSON,
    DoComposeRequestToJSON,
    DoFindUser200ResponseFromJSON,
    DoFindUser200ResponseToJSON,
    DoFollowRequestFromJSON,
    DoFollowRequestToJSON,
    DoKeyDownload200ResponseFromJSON,
    DoKeyDownload200ResponseToJSON,
    DoKeyUpload200ResponseFromJSON,
    DoKeyUpload200ResponseToJSON,
    DoLogin200ResponseFromJSON,
    DoLogin200ResponseToJSON,
    DoLoginRequestFromJSON,
    DoLoginRequestToJSON,
    DoMediaDelete200ResponseFromJSON,
    DoMediaDelete200ResponseToJSON,
    DoRegisterRequestFromJSON,
    DoRegisterRequestToJSON,
    DoStartMediaUpload200ResponseFromJSON,
    DoStartMediaUpload200ResponseToJSON,
    GetPost200ResponseFromJSON,
    GetPost200ResponseToJSON,
    GetProfilePhoto200ResponseFromJSON,
    GetProfilePhoto200ResponseToJSON,
    Hello200ResponseFromJSON,
    Hello200ResponseToJSON,
    ReceiveTimeline200ResponseFromJSON,
    ReceiveTimeline200ResponseToJSON,
    SendTimeline200ResponseFromJSON,
    SendTimeline200ResponseToJSON,
} from '../models/index';

export interface DoComposeOperationRequest {
    doComposeRequest: DoComposeRequest;
    dbosWorkflowuuid?: string;
}

export interface DoFindUserRequest {
    findUserName: string;
    dbosWorkflowuuid?: string;
}

export interface DoFollowOperationRequest {
    doFollowRequest: DoFollowRequest;
    dbosWorkflowuuid?: string;
}

export interface DoKeyDownloadRequest {
    filekey: string;
    dbosWorkflowuuid?: string;
}

export interface DoKeyUploadRequest {
    filename: string;
    dbosWorkflowuuid?: string;
}

export interface DoLoginOperationRequest {
    doLoginRequest: DoLoginRequest;
    dbosWorkflowuuid?: string;
}

export interface DoMediaDeleteRequest {
    filekey: string;
    dbosWorkflowuuid?: string;
}

export interface DoRegisterOperationRequest {
    doRegisterRequest: DoRegisterRequest;
    dbosWorkflowuuid?: string;
}

export interface DoStartMediaUploadRequest {
    dbosWorkflowuuid?: string;
}

export interface FinishMediaUploadRequest {
    wfid: string;
    dbosWorkflowuuid?: string;
}

export interface GetPostRequest {
    id: string;
    dbosWorkflowuuid?: string;
}

export interface GetProfilePhotoRequest {
    dbosWorkflowuuid?: string;
}

export interface HelloRequest {
    dbosWorkflowuuid?: string;
}

export interface ReceiveTimelineRequest {
    dbosWorkflowuuid?: string;
}

export interface SendTimelineRequest {
    dbosWorkflowuuid?: string;
}

/**
 * 
 */
export class DefaultApi extends runtime.BaseAPI {

    /**
     */
    async doComposeRaw(requestParameters: DoComposeOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Hello200Response>> {
        if (requestParameters.doComposeRequest === null || requestParameters.doComposeRequest === undefined) {
            throw new runtime.RequiredError('doComposeRequest','Required parameter requestParameters.doComposeRequest was null or undefined when calling doCompose.');
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/composepost`,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: DoComposeRequestToJSON(requestParameters.doComposeRequest),
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => Hello200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async doCompose(requestParameters: DoComposeOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Hello200Response> {
        const response = await this.doComposeRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async doFindUserRaw(requestParameters: DoFindUserRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<DoFindUser200Response>> {
        if (requestParameters.findUserName === null || requestParameters.findUserName === undefined) {
            throw new runtime.RequiredError('findUserName','Required parameter requestParameters.findUserName was null or undefined when calling doFindUser.');
        }

        const queryParameters: any = {};

        if (requestParameters.findUserName !== undefined) {
            queryParameters['findUserName'] = requestParameters.findUserName;
        }

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/finduser`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => DoFindUser200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async doFindUser(requestParameters: DoFindUserRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<DoFindUser200Response> {
        const response = await this.doFindUserRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async doFollowRaw(requestParameters: DoFollowOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Hello200Response>> {
        if (requestParameters.doFollowRequest === null || requestParameters.doFollowRequest === undefined) {
            throw new runtime.RequiredError('doFollowRequest','Required parameter requestParameters.doFollowRequest was null or undefined when calling doFollow.');
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/follow`,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: DoFollowRequestToJSON(requestParameters.doFollowRequest),
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => Hello200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async doFollow(requestParameters: DoFollowOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Hello200Response> {
        const response = await this.doFollowRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async doKeyDownloadRaw(requestParameters: DoKeyDownloadRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<DoKeyDownload200Response>> {
        if (requestParameters.filekey === null || requestParameters.filekey === undefined) {
            throw new runtime.RequiredError('filekey','Required parameter requestParameters.filekey was null or undefined when calling doKeyDownload.');
        }

        const queryParameters: any = {};

        if (requestParameters.filekey !== undefined) {
            queryParameters['filekey'] = requestParameters.filekey;
        }

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/getMediaDownloadKey`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => DoKeyDownload200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async doKeyDownload(requestParameters: DoKeyDownloadRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<DoKeyDownload200Response> {
        const response = await this.doKeyDownloadRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async doKeyUploadRaw(requestParameters: DoKeyUploadRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<DoKeyUpload200Response>> {
        if (requestParameters.filename === null || requestParameters.filename === undefined) {
            throw new runtime.RequiredError('filename','Required parameter requestParameters.filename was null or undefined when calling doKeyUpload.');
        }

        const queryParameters: any = {};

        if (requestParameters.filename !== undefined) {
            queryParameters['filename'] = requestParameters.filename;
        }

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/getMediaUploadKey`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => DoKeyUpload200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async doKeyUpload(requestParameters: DoKeyUploadRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<DoKeyUpload200Response> {
        const response = await this.doKeyUploadRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async doLoginRaw(requestParameters: DoLoginOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<DoLogin200Response>> {
        if (requestParameters.doLoginRequest === null || requestParameters.doLoginRequest === undefined) {
            throw new runtime.RequiredError('doLoginRequest','Required parameter requestParameters.doLoginRequest was null or undefined when calling doLogin.');
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/login`,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: DoLoginRequestToJSON(requestParameters.doLoginRequest),
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => DoLogin200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async doLogin(requestParameters: DoLoginOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<DoLogin200Response> {
        const response = await this.doLoginRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async doMediaDeleteRaw(requestParameters: DoMediaDeleteRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<DoMediaDelete200Response>> {
        if (requestParameters.filekey === null || requestParameters.filekey === undefined) {
            throw new runtime.RequiredError('filekey','Required parameter requestParameters.filekey was null or undefined when calling doMediaDelete.');
        }

        const queryParameters: any = {};

        if (requestParameters.filekey !== undefined) {
            queryParameters['filekey'] = requestParameters.filekey;
        }

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/deleteMedia`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => DoMediaDelete200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async doMediaDelete(requestParameters: DoMediaDeleteRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<DoMediaDelete200Response> {
        const response = await this.doMediaDeleteRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async doRegisterRaw(requestParameters: DoRegisterOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<DoLogin200Response>> {
        if (requestParameters.doRegisterRequest === null || requestParameters.doRegisterRequest === undefined) {
            throw new runtime.RequiredError('doRegisterRequest','Required parameter requestParameters.doRegisterRequest was null or undefined when calling doRegister.');
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/register`,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: DoRegisterRequestToJSON(requestParameters.doRegisterRequest),
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => DoLogin200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async doRegister(requestParameters: DoRegisterOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<DoLogin200Response> {
        const response = await this.doRegisterRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async doStartMediaUploadRaw(requestParameters: DoStartMediaUploadRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<DoStartMediaUpload200Response>> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/startMediaUpload`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => DoStartMediaUpload200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async doStartMediaUpload(requestParameters: DoStartMediaUploadRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<DoStartMediaUpload200Response> {
        const response = await this.doStartMediaUploadRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async finishMediaUploadRaw(requestParameters: FinishMediaUploadRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<any>> {
        if (requestParameters.wfid === null || requestParameters.wfid === undefined) {
            throw new runtime.RequiredError('wfid','Required parameter requestParameters.wfid was null or undefined when calling finishMediaUpload.');
        }

        const queryParameters: any = {};

        if (requestParameters.wfid !== undefined) {
            queryParameters['wfid'] = requestParameters.wfid;
        }

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/finishMediaUpload`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        if (this.isJsonMime(response.headers.get('content-type'))) {
            return new runtime.JSONApiResponse<any>(response);
        } else {
            return new runtime.TextApiResponse(response) as any;
        }
    }

    /**
     */
    async finishMediaUpload(requestParameters: FinishMediaUploadRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<any> {
        const response = await this.finishMediaUploadRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async getPostRaw(requestParameters: GetPostRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<GetPost200Response>> {
        if (requestParameters.id === null || requestParameters.id === undefined) {
            throw new runtime.RequiredError('id','Required parameter requestParameters.id was null or undefined when calling getPost.');
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/post/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters.id))),
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => GetPost200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async getPost(requestParameters: GetPostRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<GetPost200Response> {
        const response = await this.getPostRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async getProfilePhotoRaw(requestParameters: GetProfilePhotoRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<GetProfilePhoto200Response>> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/getProfilePhoto`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => GetProfilePhoto200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async getProfilePhoto(requestParameters: GetProfilePhotoRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<GetProfilePhoto200Response> {
        const response = await this.getProfilePhotoRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async helloRaw(requestParameters: HelloRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Hello200Response>> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => Hello200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async hello(requestParameters: HelloRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Hello200Response> {
        const response = await this.helloRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async receiveTimelineRaw(requestParameters: ReceiveTimelineRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ReceiveTimeline200Response>> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/recvtimeline`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ReceiveTimeline200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async receiveTimeline(requestParameters: ReceiveTimelineRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ReceiveTimeline200Response> {
        const response = await this.receiveTimelineRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     */
    async sendTimelineRaw(requestParameters: SendTimelineRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<SendTimeline200Response>> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (requestParameters.dbosWorkflowuuid !== undefined && requestParameters.dbosWorkflowuuid !== null) {
            headerParameters['dbos-workflowuuid'] = String(requestParameters.dbosWorkflowuuid);
        }

        const response = await this.request({
            path: `/sendtimeline`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => SendTimeline200ResponseFromJSON(jsonValue));
    }

    /**
     */
    async sendTimeline(requestParameters: SendTimelineRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<SendTimeline200Response> {
        const response = await this.sendTimelineRaw(requestParameters, initOverrides);
        return await response.value();
    }

}
