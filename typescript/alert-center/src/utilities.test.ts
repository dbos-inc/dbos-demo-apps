import { RespondUtilities, AlertWithMessage, AlertStatus } from "./utilities";
import knex, { Knex } from "knex";
import path from "path";

import { DBOS, DBOSConfig } from "@dbos-inc/dbos-sdk";

const config = {
  client: 'pg',
  connection: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'alert_center_test',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'dbos',
  },
};

const sysDbName = 'alert_center_test_dbos_sys';
const appDbName = config.connection.database;

export async function resetDatabase() {
  const cwd = process.cwd();

  const adminKnexConfig = {
    client: 'pg',
    connection: {
      ...config.connection,
      database: 'postgres',
    },
  };

  const knexConfig = {
    ...config,
    migrations: {
      directory: path.join(cwd, 'migrations'),
      tableName: 'knex_migrations',
    },
  }
  let knexDB: Knex = knex(adminKnexConfig);
  try {
    await knexDB.raw(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${appDbName}'`);
    await knexDB.raw(`DROP DATABASE IF EXISTS ${appDbName}`);
    await knexDB.raw(`DROP DATABASE IF EXISTS ${sysDbName}`);
    await knexDB.raw(`CREATE DATABASE ${appDbName}`);
  } finally {
    await knexDB.destroy();
  }
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
      enableOTLP: true,
      systemDatabaseUrl: `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'dbos'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${sysDbName}`,
    };
    DBOS.setConfig(dbosTestConfig);
    await resetDatabase();
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
