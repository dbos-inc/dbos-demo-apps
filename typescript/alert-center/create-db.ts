import knex from 'knex';
import config from './knexfile';
import { URL } from 'url';

async function createDatabase() {
  console.log('Checking if database exists...');

  // Parse the connection string to extract the database name
  const connectionUrl = new URL(config.connection as string);
  const originalDbName = connectionUrl.pathname.slice(1); // Remove leading slash

  // Create admin connection URL with postgres database
  const adminConnectionUrl = new URL(config.connection as string);
  adminConnectionUrl.pathname = '/postgres';

  // Create database if needed - use config from knexfile but connect to postgres database
  const adminDb = knex({
    ...config,
    connection: adminConnectionUrl.toString()
  });

  try {
    const result = await adminDb.raw(
      `SELECT 1 FROM pg_database WHERE datname = ?`,
      [originalDbName]
    );

    if (result.rows.length === 0) {
      console.log(`Creating database: ${originalDbName}`);
      await adminDb.raw(`CREATE DATABASE ??`, [originalDbName]);
      console.log(`Database created successfully: ${originalDbName}`);
    } else {
      console.log(`Database already exists: ${originalDbName}`);
    }
  } catch (error) {
    console.error('Error checking/creating database:', error);
    throw error;
  } finally {
    await adminDb.destroy();
  }
}

// Run the database creation process
createDatabase().catch((error) => {
  console.error('Database creation failed:', error);
  process.exit(1);
});
