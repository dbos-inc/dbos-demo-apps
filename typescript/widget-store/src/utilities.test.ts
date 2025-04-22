import { ShopUtilities, OrderStatus, PRODUCT_ID } from './utilities';
import knex, { Knex } from 'knex';
import path from 'path';
import { PoolConfig } from 'pg';

import { DBOS, DBOSConfig } from '@dbos-inc/dbos-sdk';

export async function resetDatabase() {
  const cwd = process.cwd();

  const connectionString = new URL((DBOS.dbosConfig?.poolConfig as PoolConfig).connectionString!);
  connectionString.pathname = '/postgres';
  const knexConfig = {
    client: 'pg',
    connection: connectionString.toString(),
    migrations: {
      directory: path.join(cwd, 'migrations'),
      tableName: 'knex_migrations',
    },
  };
  const appDbName = DBOS.dbosConfig?.poolConfig?.database;
  let knexDB: Knex = knex(knexConfig);
  try {
    await knexDB.raw(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${appDbName}'`);
    await knexDB.raw(`DROP DATABASE IF EXISTS ${appDbName}`);
    await knexDB.raw(`CREATE DATABASE ${appDbName}`);
  } finally {
    await knexDB.destroy();
  }
  knexConfig.connection = (DBOS.dbosConfig?.poolConfig as PoolConfig).connectionString!.toString();
  knexDB = knex(knexConfig);
  try {
    await knexDB.migrate.latest();
    await knexDB('products').insert([
      {
        product_id: PRODUCT_ID,
        product: 'Premium Quality Widget',
        description: 'Enhance your productivity with our top-rated widgets!',
        inventory: 12,
        price: 99.99,
      },
    ]);
  } finally {
    await knexDB.destroy();
  }
}

describe('Widget store utilities', () => {
  beforeEach(async () => {
    const dbosTestConfig: DBOSConfig = {
      databaseUrl: `postgres://postgres:${process.env.PGPASSWORD || 'dbos'}@localhost:5432/widget_store_test`,
      sysDbName: 'widget_store_test_dbos_sys',
      userDbclient: 'knex',
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

  it('Creates an order', async () => {
    const orderId = await ShopUtilities.createOrder();
    const retrievedOrder = await ShopUtilities.retrieveOrder(orderId);
    expect(retrievedOrder).toMatchObject({
      order_id: orderId,
      order_status: OrderStatus.PENDING,
      product_id: PRODUCT_ID,
    });
  });
});
