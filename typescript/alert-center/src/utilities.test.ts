import { RespondUtilities, AlertWithMessage, AlertStatus } from "./utilities";
import knex, { Knex } from "knex";
import path from "path";
import { PoolConfig } from "pg";

import { DBOS, DBOSConfig } from "@dbos-inc/dbos-sdk";

export async function resetDatabase() {
  const cwd = process.cwd();
  const knexConfig = {
    client: "pg",
    connection: DBOS.dbosConfig?.poolConfig as PoolConfig,
    migrations: {
      directory: path.join(cwd, "migrations"),
      tableName: "knex_migrations",
    },
  };
  const appDbName = DBOS.dbosConfig?.poolConfig?.database;
  knexConfig.connection.database = "postgres";
  let knexDB: Knex = knex(knexConfig);
  try {
    await knexDB.raw(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${appDbName}'`,
    );
    await knexDB.raw(`DROP DATABASE IF EXISTS ${appDbName}`);
    await knexDB.raw(`CREATE DATABASE ${appDbName}`);
  } finally {
    await knexDB.destroy();
  }
  knexConfig.connection.database = appDbName;
  knexDB = knex(knexConfig);
  try {
    await knexDB.migrate.latest();
  } finally {
    await knexDB.destroy();
  }
}

describe("AlertCenter utilities", () => {
  beforeEach(async () => {
    const dbosTestConfig: DBOSConfig = {
      databaseUrl: `postgres://postgres:${process.env.PGPASSWORD || "dbos"}@localhost:5432/alert_center_test`,
      sysDbName: "alert_center_test_dbos_sys",
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

  it("Adds an alert", async () => {
    const message: AlertWithMessage = {
      alert_id: 1,
      alert_status: AlertStatus.ACTIVE,
      message: "Test message",
    };
    await RespondUtilities.addAlert(message);
    const alerts = await RespondUtilities.getAlertStatus();
    expect(alerts.length).toBe(1);
    expect(alerts[0].alert_id).toBe(1);
    expect(alerts[0].alert_status).toBe(AlertStatus.ACTIVE);
    expect(alerts[0].message).toBe("Test message");
  });
});
