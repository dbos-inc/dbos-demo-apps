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
  // Initialize Postgres and Operon.
  const rl = readline.createInterface(process.stdin, process.stdout);
  let database = await rl.question('Enter postgres database: ');
  let username = await rl.question('Enter postgres username: ');
  let password = await rl.question('Enter postgres password: ');
  bankname = await rl.question('Enter bank name: ');
  bankport = await rl.question('Enter bank port: ');
  rl.close();

  // Default values.
  database = database ? database : "postgres";
  username = username ? username : "postgres";
  password = password ? password : "dbos";
  bankname = bankname ? bankname : "localbank";
  bankport = bankport ? bankport : "8081";

  operon = new Operon({
    database: database,
    user: username,
    password: password
  });
  await operon.resetOperonTables();

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