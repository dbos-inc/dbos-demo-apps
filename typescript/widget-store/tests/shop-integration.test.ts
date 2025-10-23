import { createOrder, retrieveOrder, OrderStatus, PRODUCT_ID } from '../src/shop';
import knex, { Knex } from 'knex';
import path from 'path';
import { Client } from 'pg';

import { DBOS, DBOSConfig } from '@dbos-inc/dbos-sdk';

// Reset the Postgres database used by these tests
export async function resetDatabase(databaseUrl: string) {
  const dbName = new URL(databaseUrl).pathname.slice(1);
  const postgresDatabaseUrl = new URL(databaseUrl);
  postgresDatabaseUrl.pathname = '/postgres';

  const client = new Client({ connectionString: postgresDatabaseUrl.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await client.end();
  }
}

// Recreate the database tables used by the application being tested
export async function migrateShopDatabase(databaseUrl: string) {
  const cwd = process.cwd();

  const knexConfig: Knex.Config = {
    client: 'pg',
    connection: databaseUrl,
    migrations: {
      directory: path.join(cwd, 'migrations'),
      tableName: 'knex_migrations',
    },
  };
  const knexDB = knex(knexConfig);
  try {
    await knexDB.migrate.latest();
  } finally {
    await knexDB.destroy();
  }
}

describe('shop integration tests', () => {
  beforeEach(async () => {
    // An integration test requires a Postgres connection
    const databaseUrl = process.env.DBOS_DATABASE_URL;
    if (!databaseUrl) {
      throw Error("DBOS_DATABASE_URL must be set to run this test")
    }

    // Shut down DBOS (in case a previous test launched it) and reset the database.
    await DBOS.shutdown();
    await resetDatabase(databaseUrl);
    await migrateShopDatabase(databaseUrl);

    // Configure and launch DBOS
    const dbosTestConfig: DBOSConfig = {
      name: "widget-store-test",
      systemDatabaseUrl: databaseUrl,
    };
    DBOS.setConfig(dbosTestConfig);
    await DBOS.launch();
  }, 10000);

  afterEach(async () => {
    await DBOS.shutdown();
  });

  it('Creates an order', async () => {
    const orderId = await createOrder();
    const retrievedOrder = await retrieveOrder(orderId);
    expect(retrievedOrder).toMatchObject({
      order_id: orderId,
      order_status: OrderStatus.PENDING,
      product_id: PRODUCT_ID,
    });
  });
});
