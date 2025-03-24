import { MyWorkflow } from "./operations";
import { PoolConfig } from "pg";
import knex, { Knex } from "knex";

import { DBOS, DBOSConfig } from "@dbos-inc/dbos-sdk";

export async function resetDatabase(poolConfig: PoolConfig) {
  const knexConfig = {
    client: "pg",
    connection: poolConfig,
  };
  const appDbName = poolConfig.database;
  knexConfig.connection.database = "postgres";
  const knexDB: Knex = knex(knexConfig);
  try {
    await knexDB.raw(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${appDbName}'`,
    );
    await knexDB.raw(`DROP DATABASE IF EXISTS ${appDbName}`);
    await knexDB.raw(`CREATE DATABASE ${appDbName}`);
  } finally {
    await knexDB.destroy();
  }
}

describe("Nest.js action", () => {
  beforeEach(async () => {
    const dbosTestConfig: DBOSConfig = {
      poolConfig: {
        host: "localhost",
        port: 5432,
        database: "nextjs_starter",
        user: "postgres",
        password: process.env.PGPASSWORD || "dbos",
      },
      system_database: "nextjs_starter_dbos_sys",
      userDbclient: "knex",
    };
    DBOS.setConfig(dbosTestConfig);
    // TODO drop system DB
    await resetDatabase(DBOS.dbosConfig!.poolConfig);
    await DBOS.shutdown();
    await DBOS.launch();
  }, 10000);

  afterEach(async () => {
    await DBOS.shutdown();
  });

  it("should run the workflow", async () => {
    const handle = await DBOS.startWorkflow(MyWorkflow).backgroundTask(3);
    await handle.getResult();
    const wfid = handle.getWorkflowUUID();
    await expect(DBOS.getEvent(wfid, "steps_event")).resolves.toEqual(3);
  }, 15000);
});
