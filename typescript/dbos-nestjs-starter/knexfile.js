const config = {
  client: "pg",
  connection: process.env.DBOS_DATABASE_URL || `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'dbos'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'dbos_nest_starter'}`,

  migrations: {
    directory: "./migrations",
  },
};

module.exports = config;
