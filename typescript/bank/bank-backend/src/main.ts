import { DBOS, parseConfigFile } from '@dbos-inc/dbos-sdk';
import { dkoa } from './operations';
import Koa from 'koa';
import Router from '@koa/router';

const PORT = parseInt(process.env.BANK_PORT ?? '3000');

async function main() {
  DBOS.setConfig(parseConfigFile()[0]);

  await DBOS.launch();

  const app = new Koa();
  const appRouter = new Router();
  dkoa.registerWithApp(app, appRouter);
  dkoa.logRegisteredEndpoints();

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

main().then(()=>{}).catch(console.error);