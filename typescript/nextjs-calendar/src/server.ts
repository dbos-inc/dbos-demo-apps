import 'reflect-metadata';  // ✅ This must be the first import
import next from 'next';
import http, { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import fg from 'fast-glob';
import { pathToFileURL } from 'url';

import { WebSocketServer, WebSocket } from 'ws';

import "./module-aliases";
import { DBOS, parseConfigFile } from '@dbos-inc/dbos-sdk';

// This is to handle files, in case entrypoints is not manually specified
// We are looking for .js server code, in the 'dbos/' subdirectory.
export async function loadAllDBOSServerFiles() {
  const loaded: string[] = [];
  const serverDir = path.resolve(__dirname, "dbos");

  const files = await fg(['**/*.ts', '**/*.js'], {
    cwd: serverDir,
    absolute: true,
  });

  console.log(`Files in ${serverDir}: ${files.length}`);

  for (const file of files) {
    if (file.endsWith('.d.ts')) continue;
    try {
      // Dynamically load the file
      //  (For CommonJS, do `await require(file);` instead.)
      await await import(pathToFileURL(file).href);
      console.log(`Loaded: ${file}`);
      loaded.push(file);
    } catch (error) {
      console.error(`Error loading ${file}:`, error);
    }
  }

  return loaded;
}

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();


async function main() {
  const [cfg, rtcfg] = parseConfigFile();

  DBOS.logger.info('Loading server files...');
  const files = await loadAllDBOSServerFiles();
  DBOS.logger.info('  ...loaded.')

  DBOS.setConfig(cfg, rtcfg);
  DBOS.logger.info('Launching...');
  await DBOS.launch();
  DBOS.logger.info('  ...launched.');

  // Do not launch the HTTP server but do arrange for services
  DBOS.setUpHandlerCallback();

  DBOS.logger.info(`Configuration given: ${JSON.stringify(rtcfg)}`);
  DBOS.logger.info(`Loaded: ${JSON.stringify(files)} `);

  DBOS.logger.info(`Doing Next App Prepare...`);
  await app.prepare();
  DBOS.logger.info(`  ...prepared.`);

  // Create HTTP server
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/dbos')) {
      // Pass API routes to DBOS
      DBOS.getHTTPHandlersCallback()!(req, res);
    }
    else {
      // Pass rest of the routes to Next.js
      handle(req, res as ServerResponse<IncomingMessage>);
    }
  })

  // Create WebSocket server
  const wss = new WebSocketServer({ noServer: true });
  const gss: Set<WebSocket> = new Set();
  globalThis.webSocketClients = gss;
  wss.on('connection', (ws: WebSocket) => {
    DBOS.logger.debug('Client connected to WebSocket');
    gss.add(ws);
    DBOS.logger.debug(`${gss.size} clients`);

    ws.send(JSON.stringify({ type: 'connected' }));

    ws.on('message', (_data) => {
      ws.send(JSON.stringify({ type: 'received' }));
    });

    ws.on('close', () => {
      gss.delete(ws);
      DBOS.logger.info('Client disconnected');
    });
  });

  // Register WebSocket server under /ws
  // Upgrade HTTP to WebSocket when hitting `/ws`
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy(); // Reject unknown upgrade requests
    }
  });

  const PORT = DBOS.runtimeConfig?.port ?? 3000;
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
