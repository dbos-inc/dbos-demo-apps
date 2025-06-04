import knex from 'knex';
import config from './knexfile';

async function createDatabase() {
  console.log('Checking if database exists...');

  // Create database if needed - use config from knexfile but connect to postgres database
  const adminDb = knex({
    ...config,
    connection: {
      ...config.connection,
      database: 'postgres', // Connect to default database
    }
  });

  try {
    const result = await adminDb.raw(
      `SELECT 1 FROM pg_database WHERE datname = ?`,
      [config.connection.database]
    );

    if (result.rows.length === 0) {
      console.log(`Creating database: ${config.connection.database}`);
      await adminDb.raw(`CREATE DATABASE ??`, [config.connection.database]);
      console.log(`Database created successfully: ${config.connection.database}`);
    } else {
      console.log(`Database already exists: ${config.connection.database}`);
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
