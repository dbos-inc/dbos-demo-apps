import * as readline from "node:readline/promises";
import { Operon } from "operon";
import { PrismaClient } from "@prisma/client";
import { OperonHttpServer } from "operon/dist/src/httpServer/server";
import { BankEndpoints } from "./router";

// A hack for bigint serializing to/from JSON.
import "json-bigint-patch";

export let bankname: string;
export let bankport: string;
export let operon: Operon;

// TODO: this is a hack -- we must use the BankEndpoints module. Otherwise, even if we import it, it will not be loaded and decorators won't run at all.
BankEndpoints.load();

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

  // Register transactions and workflows
  operon.registerDecoratedWT();

  await operon.init();

  /**
   * TODO: add back auth once we support customized middleware.
   */

  const operonServer = new OperonHttpServer(operon);
  operonServer.listen(Number(bankport));
}

void startServer();
