import * as readline from "node:readline/promises";
import { Operon, OperonHttpServer } from "@dbos-inc/operon";
import { parseConfigFile } from "@dbos-inc/operon/dist/src/operon-runtime/config";
import { PrismaClient } from "@prisma/client";
import { BankEndpoints } from "./router";

// A hack for bigint serializing to/from JSON.
import "json-bigint-patch";
import { BankTransactionHistory } from "./workflows/txnhistory.workflows";
import { BankAccountInfo } from "./workflows/accountinfo.workflows";

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

  // FIXME: remove reading config file once fully serverless.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [operonConfig, _runtimeConfig] = parseConfigFile();
  operon = new Operon(operonConfig);
  operon.usePrisma(prisma);

  await operon.init(BankEndpoints, BankTransactionHistory, BankAccountInfo);

  const operonServer = new OperonHttpServer(operon);
  operonServer.listen(Number(bankport));
}

void startServer();
