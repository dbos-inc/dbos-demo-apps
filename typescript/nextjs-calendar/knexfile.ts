const config = {
  client: 'pg',
  connection: process.env.DBOS_DATABASE_URL || 'postgresql://postgres:dbos@localhost:5432/dbos_next_calendar',
  migrations: {
    directory: './migrations'
  }
};

export default config;