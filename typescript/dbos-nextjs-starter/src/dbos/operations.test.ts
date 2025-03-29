import { MyWorkflow } from "./operations";
import { PoolConfig } from "pg";
import knex, { Knex } from "knex";

import { DBOS, DBOSConfig } from "@dbos-inc/dbos-sdk";

export async function resetDatabase() {
  const knexConfig = {
    client: "pg",
    connection: DBOS.dbosConfig?.poolConfig as PoolConfig,
  };
  const appDbName = DBOS.dbosConfig?.poolConfig?.database;
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
      databaseUrl: `postgres://postgres:${process.env.PGPASSWORD || "dbos"}@localhost:5432/nextjs_starter_test`,
      sysDbName: "nextjs_starter_dbos_sys",
      userDbclient: "knex",
    };
    DBOS.setConfig(dbosTestConfig);
    await resetDatabase();
    await DBOS.dropSystemDB();
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
