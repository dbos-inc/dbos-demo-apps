import { AppService, GreetingRecord } from "../src/app.service";
import { PoolConfig } from "pg";
import path from "path";
import knex, { Knex } from "knex";

import { DBOS, DBOSConfig } from "@dbos-inc/dbos-sdk";

export async function resetDatabase() {
  const cwd = process.cwd();
  const poolConfig = DBOS.dbosConfig?.poolConfig as PoolConfig;
  const connectionString = new URL(poolConfig.connectionString!);
  connectionString.pathname = '/postgres';
  const knexConfig = {
    client: "pg",
    connection: connectionString.toString(),
    migrations: {
      directory: path.join(cwd, "migrations"),
      tableName: "knex_migrations",
    },
  };
  const appDbName = DBOS.dbosConfig?.poolConfig?.database;
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
  knexConfig.connection = poolConfig.connectionString!.toString();
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
      databaseUrl: `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || "dbos"}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'nestjs_starter'}`,
      sysDbName: 'nestjs_starter_dbos_sys',
    };
    DBOS.setConfig(dbosTestConfig);
    await resetDatabase();
    await DBOS.dropSystemDB();
    await DBOS.shutdown();

    service = new AppService("dbosAppService");

    await DBOS.launch();
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
