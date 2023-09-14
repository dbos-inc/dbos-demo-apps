import Koa from "koa";
import logger from "koa-logger";
import { bodyParser } from "@koa/bodyparser";
import cors from "@koa/cors";
import * as readline from "node:readline/promises";
import { Operon } from "operon";
import { router } from "./router";
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
  bankname = await rl.question("Enter bank name: ");
  bankport = await rl.question("Enter bank port: ");
  rl.close();

  bankname = bankname ? bankname : "localbank";
  bankport = bankport ? bankport : "8081";

  // Initialize Operon.
  operon = new Operon();
  operon.usePrisma(prisma);
  await operon.init();

  // Register transactions and workflows
  operon.registerDecoratedWT();

  // Start Koa server.
  const app = new Koa();

  app.use(logger());
  app.use(bodyParser());
  app.use(cors());

  /**
   * TODO: add back auth once we support customized middleware.
   */

  app.use(router.routes()).use(router.allowedMethods());

  app.listen(bankport, () => {
    console.log("Koa bank %s started at port: %d", bankname, bankport);
  });
}

void startServer();
