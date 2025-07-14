const fs = require('node:fs');
const path = require('node:path');

// Write out the .env file
const databaseURL = 
  process.env['DATABASE_URL'] ||
  `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'dbos'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'bank_backend'}`;

try {
  fs.writeFileSync(path.join(process.cwd(), 'prisma', '.env'), `DATABASE_URL="${databaseURL}"`);
  console.log("Wrote database URL to the prisma/.env file.");
} catch (error) {
  console.error("Error writing prisma/.env file:", error.message);
}
