import * as readline from "node:readline/promises";
import { Operon } from "operon";
import { PrismaClient } from "@prisma/client";
import { OperonHttpServer } from "operon/dist/src/httpServer/server";
import { BankEndpoints, bankAuthMiddleware } from "./router";

// A hack for bigint serializing to/from JSON.
import "json-bigint-patch";
import { BankTransactionHistory } from "./workflows/txnhistory.workflows";
import { BankAccountInfo } from "./workflows/accountinfo.workflows";

import Koa from "koa";
import logger from "koa-logger";
import { bodyParser } from "@koa/bodyparser";
import cors from "@koa/cors";
import jwt from "koa-jwt";
import { koaJwtSecret } from "jwks-rsa";

export let bankname: string;
export let bankport: string;
let operon: Operon;

async function startServer() {
  // Initialize a Prisma client.
  const prisma = new PrismaClient();
  // Prompt user for bank initialization information
  const rl = readline.createInterface(process.stdin, process.stdout);
  bankname = await rl.question("Enter bank name: ");
  bankport = await rl.question("Enter bank port: ");
  rl.close();

  bankname = bankname ? bankname : "localbank";
  bankport = bankport ? bankport : "8081";

  // Initialize Operon.
  operon = new Operon();
  operon.usePrisma(prisma);

  await operon.init(BankEndpoints, BankTransactionHistory, BankAccountInfo);

  // Create a Koa server and register customized middlewares.
  const app = new Koa();
  app.use(logger());
  app.use(bodyParser());
  app.use(cors());

  // Custom 401 handling if you don't want to expose koa-jwt errors to users
  app.use(function(ctx, next){
    return next().catch((err) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (401 === err.status) {
        ctx.status = 401;
        ctx.body = 'Protected resource, use Authorization header to get access\n';
      } else {
        throw err;
      }
    });
  });

  app.use(jwt({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    secret: koaJwtSecret({
      jwksUri: `http://${operon.config.poolConfig.host || "localhost"}:${process.env.AUTH_PORT || "8083"}/realms/dbos/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000
    }),
    // audience: 'urn:api/',
    issuer: `http://${operon.config.poolConfig.host || "localhost"}:${process.env.AUTH_PORT || "8083"}/realms/dbos`
  }));

  // TODO: should OperonHTTPAuthMiddleware be a function type not an interface? The semantics here is a bit verbose.
  const operonServer = new OperonHttpServer(operon, {koa: app, authMiddleware: bankAuthMiddleware});
  operonServer.listen(Number(bankport));
}

void startServer();
