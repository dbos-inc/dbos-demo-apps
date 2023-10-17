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

operon.init(YKY, Operations)
  .then(() => {
    return operon.userDatabase.createSchema();
  }).then(() => {
    console.log("Schema created");
    return operon.destroy();
  }).then(() => {
    console.log("End.");
  }).catch((e: Error) => {
    console.log("Failed to create database schema.");
    console.log(e);
  });

