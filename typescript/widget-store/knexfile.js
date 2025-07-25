const config = {
  client: 'pg',
  connection: process.env.DBOS_DATABASE_URL || `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'dbos'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'widget_store_node'}`,
  migrations: {
    directory: './migrations'
  }
};

export default config;