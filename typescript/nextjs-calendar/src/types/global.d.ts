/* eslint-disable no-var */
import WebSocket from "ws";
import { DBOS_SES } from "@dbos-inc/dbos-email-ses";
import { DBOSBored as DBOSBoredT } from "@dbos/operations";

export declare global {
  var webSocketClients: Set<WebSocket> | undefined;
  var reportSes: DBOS_SES | undefined;
  var DBOSBored: typeof DBOSBoredT | undefined;
};
