import Koa from "koa";
import logger from "koa-logger";
import { bodyParser } from "@koa/bodyparser";
import cors from "@koa/cors";
import * as readline from "node:readline/promises";
import { Operon } from "operon";
import { router } from "./router";
import jwt from "koa-jwt";
import { koaJwtSecret } from "jwks-rsa";
import { createAccountFunc, listAccountsFunc } from "./workflows/accountinfo.workflows";
import {
  depositWorkflow,
  listTxnForAccountFunc,
  withdrawWorkflow,
  internalTransferFunc,
  updateAcctTransactionFunc,
  remoteTransferComm
} from "./workflows/txnhistory.workflows";
import { PrismaClient } from "@prisma/client";

// A hack for bigint serializing to/from JSON.
import "json-bigint-patch";

export let bankname: string;
export let bankport: string;
export let operon: Operon;

async function startServer() {
  // Initialize a Prisma client.
  const prisma = new PrismaClient();
  // Prompt user for bank initialization information
  const rl = readline.createInterface(process.stdin, process.stdout);
  bankname = await rl.question('Enter bank name: ');
  bankport = await rl.question('Enter bank port: ');
  rl.close();

  bankname = bankname ? bankname : "localbank";
  bankport = bankport ? bankport : "8081";

  // Initialize Operon.
  operon = new Operon();
  operon.usePrisma(prisma);
  await operon.init();

  // Register transactions and workflows
  operon.registerTransaction(createAccountFunc);
  operon.registerTransaction(listAccountsFunc);
  operon.registerTransaction(internalTransferFunc);
  operon.registerTransaction(listTxnForAccountFunc);
  operon.registerTransaction(updateAcctTransactionFunc);
  operon.registerCommunicator(remoteTransferComm);

  operon.registerWorkflow(withdrawWorkflow);
  operon.registerWorkflow(depositWorkflow);

  // Start Koa server.
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
      jwksUri: `http://${operon.config.poolConfig.host || "localhost"}:${process.env.AUTH_PORT || "8083"}/auth/realms/dbos/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000
    }),
    // audience: 'urn:api/',
    issuer: `http://${operon.config.poolConfig.host || "localhost"}:${process.env.AUTH_PORT || "8083"}/auth/realms/dbos`
  }));

  app.use(router.routes()).use(router.allowedMethods());

  app.listen(bankport, () => {
    console.log("Koa bank %s started at port: %d", bankname, bankport);
  });
}

void startServer();