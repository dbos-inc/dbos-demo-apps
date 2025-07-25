import path from 'node:path';
import { fileURLToPath } from 'node:url';

import knex from 'knex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Note, there is no requirement to use DBOS_DATABASE_URL with DBOS Data Sources if you're self hosting.
// We are using DBOS_DATABASE_URL here so this demo application can run in DBOS Cloud.

const databaseUrl = process.env.DBOS_DATABASE_URL || 
  `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'dbos'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'dbos_node_toolbox'}`;

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
    const exists = await checkDB(knexDB, dbName);
    if (!exists) {
      await knexDB.raw('CREATE DATABASE ??', [dbName]);
    }
  } finally {
    await knexDB.destroy();
  }
}

async function main() {
  await ensureDB(databaseUrl);

  const knexDB = knex({
    client: 'pg',
    connection: databaseUrl,
    migrations: {
      directory: path.join(__dirname, 'migrations')
    },
  });
  try {
    await knexDB.migrate.latest();
  } finally {
    await knexDB.destroy();
  }
}

main().catch(console.error);
