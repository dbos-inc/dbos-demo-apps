/* eslint-disable no-var */
import WebSocket from "ws";
import { SESv2 } from '@aws-sdk/client-sesv2';
import { DBOSBored as DBOSBoredT } from "@dbos/operations";

export declare global {
  var webSocketClients: Set<WebSocket> | undefined;
  var reportSes: SESv2 | undefined;
  var DBOSBored: typeof DBOSBoredT | undefined;
};
