import { DBOS } from '@dbos-inc/dbos-sdk';
import { dkoa } from './operations';
import Koa from 'koa';
import Router from '@koa/router';

const PORT = parseInt(process.env.PAYMENT_PORT ?? '3000');

async function main() {
  DBOS.setConfig({"name": "payment-backend", "enableOTLP": true, "systemDatabaseUrl": process.env.DBOS_SYSTEM_DATABASE_URL});
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
