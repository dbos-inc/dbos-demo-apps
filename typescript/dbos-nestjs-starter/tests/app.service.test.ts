import { AppService, GreetingRecord } from "../src/app.service";
import { PoolConfig } from "pg";
import path from "path";
import knex, { Knex } from "knex";

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

describe("AppService", () => {
  let service: AppService;

  beforeEach(async () => {
    const dbosTestConfig: DBOSConfig = {
      databaseUrl: `postgres://postgres:${process.env.PGPASSWORD || "dbos"}@localhost:5432/nestjs_starter_test`,
      sysDbName: 'nestjs_starter_dbos_sys',
      userDbclient: "knex",
    };
    DBOS.setConfig(dbosTestConfig);
    await resetDatabase();
    await DBOS.dropSystemDB();
    await DBOS.shutdown();
    await DBOS.launch();

    service = new AppService("dbosAppService");
  }, 10000);

  afterEach(async () => {
    await DBOS.shutdown();
  });

  it("should insert a greeting record with a generated name", async () => {
    // Execute the insert method
    const result = await service.insert();

    // Verify the result format
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(1);
    const record: GreetingRecord = result[0];
    expect(record.greeting_note_content).toBe("Hello World!");
  });
});
