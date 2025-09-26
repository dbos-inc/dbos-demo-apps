import next from 'next';
import http, { IncomingMessage, ServerResponse } from 'http';

import { DBOS } from '@dbos-inc/dbos-sdk';

import "./module-aliases";

export { MyWorkflow } from "@dbos/operations"

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();


async function main() {
  DBOS.logger.info('Launching...');
  DBOS.setConfig({
    "name": "dbos-nextjs-starter",
  });
  await DBOS.launch();
  DBOS.logger.info('  ...launched.');

  DBOS.logger.info(`Doing Next App Prepare...`);
  await app.prepare();
  DBOS.logger.info(`  ...prepared.`);

  // Create HTTP server
  const server = http.createServer((req, res) => {
    handle(req, res as ServerResponse<IncomingMessage>);
  });

  const PORT = process.env.NODE_PORT ?? 3000;
  const ENV = process.env.NODE_ENV || 'development';

  server.listen(PORT, () => {
    DBOS.logger.info(`🚀 Server is running on http://localhost:${PORT}`);
    DBOS.logger.info(`🌟 Environment: ${ENV}`);
  });
}

// Only start the server when this file is run directly from Node
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Server failed to start:', error);
    DBOS.logger.error('❌ Server failed to start:', error);
    process.exit(1);  // Ensure the process exits on failure
  });
}
