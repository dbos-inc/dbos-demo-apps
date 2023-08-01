import Koa from "koa";
import logger from "koa-logger";
import { bodyParser } from "@koa/bodyparser";
import cors from "@koa/cors";
import * as readline from "node:readline/promises";
import { Operon } from "operon";
import { router } from "./router";
import { BankSchema } from "./sql/schema";

export let bankname: string;
export let bankport: string;
export let operon: Operon;

async function startServer() {
  // Initialize Operon.
  operon = new Operon();
  await operon.init();

  // Create bank tables.
  await operon.pool.query(BankSchema.accountInfoTable);
  await operon.pool.query(BankSchema.transactionHistoryTable);

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