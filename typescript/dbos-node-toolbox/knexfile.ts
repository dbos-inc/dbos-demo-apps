const config = {
  client: 'pg',
  connection: process.env.DBOS_DATABASE_URL || 'postgresql://postgres:dbos@localhost:5432/dbos_node_toolbox',
  migrations: {
    directory: './migrations'
  }
};

export default config;
