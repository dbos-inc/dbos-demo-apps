import { AppService, GreetingRecord } from "../src/app.service";
import path from "path";
import knex, { Knex } from "knex";

import { DBOS, DBOSConfig } from "@dbos-inc/dbos-sdk";

const config = {
  client: 'pg',
  connection: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'dbos_nest_starter_test',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'dbos',
  },
};

const sysDbName = 'dbos_nest_starter_test_dbos_sys';
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

describe("AppService", () => {
  let service: AppService;

  beforeEach(async () => {
    const dbosTestConfig: DBOSConfig = {
      databaseUrl: `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || "dbos"}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${appDbName}`,
      systemDatabaseUrl: `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || "dbos"}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${sysDbName}`,
    };
    DBOS.setConfig(dbosTestConfig);
    await resetDatabase();
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
