import { Test, TestingModule } from '@nestjs/testing';
import { AppService, GreetingRecord } from '../src/app.service';
import { PoolConfig } from 'pg';
import path from "path";
import knex, { Knex } from "knex";

import { DBOS, DBOSConfig } from "@dbos-inc/dbos-sdk";
import { expressTracingMiddleware } from '@dbos-inc/dbos-sdk/dist/src/httpServer/middleware';

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

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const dbosTestConfig: DBOSConfig = {
      poolConfig: {
        host: "localhost",
        port: 5432,
        database: "nestjs_starter",
        user: "postgres",
        password: process.env.PGPASSWORD || "dbos",
      },
      system_database: "nestjs_starter_dbos_sys",
      userDbclient: "knex",
    };
    DBOS.setConfig(dbosTestConfig);
    // TODO drop system DB
    await resetDatabase(DBOS.dbosConfig!.poolConfig);
    await DBOS.shutdown();
    await DBOS.launch();

    service = new AppService('dbosAppService');
  }, 10000);

  afterEach(async () => {
    await DBOS.shutdown();
  });
  
    it('should insert a greeting record with a generated name', async () => {
      // Execute the insert method
      const result = await service.insert();
      
      // Verify the result format
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      const record: GreetingRecord = result[0];
      expect(record.greeting_note_content).toBe('Hello World!');
    });
});