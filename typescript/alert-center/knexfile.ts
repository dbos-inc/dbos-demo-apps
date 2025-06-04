import { parseConfigFile } from '@dbos-inc/dbos-sdk'

const [dbosConfig] = parseConfigFile();

const config = {
  client: 'pg',
  connection: process.env.DBOS_DATABASE_URL || 'postgresql://postgres:dbos@localhost:5432/alert_center',
  migrations: {
    directory: './migrations'
  }
};

export default config;
