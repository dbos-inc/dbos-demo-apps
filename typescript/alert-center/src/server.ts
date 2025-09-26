import { DBOS } from '@dbos-inc/dbos-sdk';
import { dkoa } from './frontend';
import Koa from 'koa';
import Router from '@koa/router';
import { setUpKafka } from './operations';

const PORT = parseInt(process.env.NODE_PORT ?? '3000');

async function main() {
  DBOS.setConfig({
    "name": "alert-center",
    "systemDatabaseUrl": process.env.DBOS_SYSTEM_DATABASE_URL,
    "enableOTLP": true,
  });

  await setUpKafka();

  await DBOS.launch();
  DBOS.logRegisteredEndpoints();

  const app = new Koa();
  const appRouter = new Router();
  dkoa.registerWithApp(app, appRouter);

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

main().then(()=>{}).catch(console.error);