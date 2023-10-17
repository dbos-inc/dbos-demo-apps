import Koa from 'koa';
import Router from "@koa/router";
import logger from "koa-logger";
import { bodyParser } from "@koa/bodyparser";

import {
  OperonHttpServer,
} from '@dbos-inc/operon';

import { Operon } from "@dbos-inc/operon/dist/src/operon";

import { YKY } from './app';
import { Operations } from "./YKYOperations";

// Initialize Operon.
export const operon = new Operon({
  poolConfig: {
    user: process.env.POSTGRES_USERNAME,
    database: process.env.POSTGRES_DBNAME,
    password: process.env.POSTGRES_PASSWORD,
    port: Number(process.env.POSTGRES_PORT),
    host: process.env.POSTGRES_HOST,
  },
  userDbclient: 'typeorm',
  system_database: 'opsys',
});

export const kapp = new Koa();

// Start Koa server.
kapp.use(logger());
kapp.use(bodyParser());
//kapp.use(cors());

const router = new Router();

export function ykyInit()
{
  OperonHttpServer.registerDecoratedEndpoints(operon, router);
}

// Example of how to do a route directly in Koa
router.get("/koa", async (ctx, next) => {
  return YKY.helloctx(ctx, next);
});

kapp.use(router.routes()).use(router.allowedMethods());

operon.init(YKY, Operations)
  .then(() => {
    return operon.userDatabase.createSchema();
  })
  .then(() => {
    console.log("Operon has been initialized!");
    ykyInit();
    kapp.listen(3000, () => {
      console.log("Server started on port 3000");
    });
  })
  .catch((err) => {
    console.error("Error during Data Source initialization", err);
  });

