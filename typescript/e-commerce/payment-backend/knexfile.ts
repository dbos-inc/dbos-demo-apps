import { Knex } from 'knex';

const config: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'payment',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'dbos',
  },
  migrations: {
    directory: './migrations'
  }
};

export default config;
