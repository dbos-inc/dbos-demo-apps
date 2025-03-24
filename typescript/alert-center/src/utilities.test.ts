import { RespondUtilities, AlertWithMessage, AlertStatus } from "./utilities";
import knex, { Knex } from "knex";
import path from "path";
import { PoolConfig } from "pg";

import { DBOS, DBOSConfig } from "@dbos-inc/dbos-sdk";

export async function resetDatabase(poolConfig: PoolConfig) {
  const cwd = process.cwd();
  const knexConfig = {
    client: "pg",
    connection: poolConfig,
    migrations: {
      directory: path.join(cwd, "migrations"),
      tableName: "knex_migrations",
    },
  };
  const appDbName = poolConfig.database;
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
      poolConfig: {
        host: "localhost",
        port: 5432,
        database: "alert_center_test",
        user: "postgres",
        password: process.env.PGPASSWORD || "dbos",
      },
      system_database: "alert_center_test_dbos_sys",
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
