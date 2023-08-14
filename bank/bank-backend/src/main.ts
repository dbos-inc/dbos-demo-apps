import Koa from "koa";
import logger from "koa-logger";
import { bodyParser } from "@koa/bodyparser";
import cors from "@koa/cors";
import * as readline from "node:readline/promises";
import { Operon } from "operon";
import { router } from "./router";
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

  app.use(router.routes()).use(router.allowedMethods());

  app.listen(bankport, () => {
    console.log("Koa bank %s started at port: %d", bankname, bankport);
  });
}

void startServer();