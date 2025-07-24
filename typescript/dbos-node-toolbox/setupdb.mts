import path from 'node:path';
import { fileURLToPath } from 'node:url';

import knex from 'knex';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DBOS_DATABASE_URL || 
  `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'dbos'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'postgres'}`;


async function checkDB(knexDB: knex.Knex, dbName: string) {
  const results = await knexDB.raw('SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ?) as "exists"', [dbName]);
  return results.rows[0].exists;
}

async function ensureDB(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.slice(1); 
  url.pathname = '/postgres';

  const knexDB = knex({
    client: 'pg',
    connection: url.toString(),
  });

  try {

  const foo = await checkDB(knexDB, dbName);
  console.log(foo);
  } finally {
    await knexDB.destroy();
  }


}

async function main() {
  await ensureDB(databaseUrl);

  // const $ = knex({
  //   client: 'pg',
  //   connection: databaseUrl,
  //   migrations: {
  //     directory: `${__dirname}/migrations`,
  //   },
  // });
  // try {
  //   await $.migrate.latest();
  // } finally {
  //   await $.destroy();
  // }
}

main().catch(console.error);
