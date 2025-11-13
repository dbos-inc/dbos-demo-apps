import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DBOS } from '@dbos-inc/dbos-sdk';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  DBOS.setConfig({
    name: 'dbos-nestjs-starter',
    systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
  });
  await DBOS.launch();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
