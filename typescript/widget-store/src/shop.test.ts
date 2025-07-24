import { createOrder, retrieveOrder, OrderStatus, PRODUCT_ID } from './shop';
import knex, { Knex } from 'knex';
import path from 'path';

import { DBOS, DBOSConfig } from '@dbos-inc/dbos-sdk';

const config = {
  client: 'pg',
  connection: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'widget_store_test',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'dbos',
  },
};

const sysDbName = 'widget_store_test_dbos_sys';
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
  };
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
      databaseUrl: `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'dbos'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'widget_store_test'}`,
      systemDatabaseUrl: `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'dbos'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${sysDbName}`,
    };
    DBOS.setConfig(dbosTestConfig);
    await resetDatabase();
    await DBOS.shutdown();
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
