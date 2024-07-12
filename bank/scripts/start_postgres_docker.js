const { execSync } = require('child_process');

async function startPG() {
// Default PostgreSQL port
let port = process.env['PGPORT'] || '5432';

// Set the host PostgreSQL port with the -p/--port flag.
process.argv.forEach((val, index) => {
  if (val === '-p' || val === '--port') {
    if (process.argv[index + 1]) {
      port = process.argv[index + 1];
    }
  }
});

if (!process.env.PGPASSWORD) {
  console.error("Error: PGPASSWORD is not set.");
  process.exit(1);
}

const PGPASSWORD = process.env.PGPASSWORD.replace(/(["\\$`])/g, '\\$1');

const sleepms = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  execSync(`docker run --rm --name=bankdb --env=POSTGRES_PASSWORD="${PGPASSWORD}" --env=PGDATA=/var/lib/postgresql/data --volume=/var/lib/postgresql/data -p ${port}:5432 -d postgres:16.1`);
  console.log("Waiting for PostgreSQL to start...");

  let attempts = 300;
  let started = false;
  for (; attempts > 0; --attempts) {
    try
    {
      execSync('docker exec bankdb pg_isready -U postgres | grep -q "accepting connections"', { stdio: 'ignore' });
      console.log("PostgreSQL started!");
      console.log("Database started successfully!");
      started = true;
      break;
    } catch (error) {
      await sleepms(100);
    }
  }
  if (!started) {
    console.error("Failed to start PostgreSQL.");
  }
  else {
    try {
      // Create a new user and database for each bank ('bank_a', 'bank_b').
      execSync(`docker exec bankdb psql -U postgres -c "CREATE USER bank_a WITH PASSWORD '${PGPASSWORD}';"`, {stdio: 'inherit'});
      execSync(`docker exec bankdb psql -U postgres -c "ALTER USER bank_a CREATEDB;"`, {stdio: 'inherit'});
      execSync(`docker exec bankdb psql -U postgres -c "CREATE USER bank_b WITH PASSWORD '${PGPASSWORD}';"`, {stdio: 'inherit'});
      execSync(`docker exec bankdb psql -U postgres -c "ALTER USER bank_b CREATEDB;"`, {stdio: 'inherit'});
      
      // Drop if exists and create a new one.
      execSync(`docker exec bankdb psql -U postgres -c "CREATE DATABASE bank_a OWNER bank_a;"`, {stdio: 'inherit'});
      execSync(`echo "Database user: 'bank_a' and database: 'bank_a' created."`, {stdio: 'inherit'});
      execSync(`docker exec bankdb psql -U postgres -c "CREATE DATABASE bank_b OWNER bank_b;"`, {stdio: 'inherit'});
      execSync(`echo "Database user: 'bank_b' and database: 'bank_b' created."`, {stdio: 'inherit'});
    } catch (error) {
      console.error("Error setting up bank users and databases in PostgreSQL in Docker:", error.message);
    }
  }
} catch (error) {
  console.error("Error starting PostgreSQL in Docker:", error.message);
}
}

startPG().then().catch((e)=>console.log(e));