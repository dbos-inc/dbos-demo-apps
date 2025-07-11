import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { DBOS } from "@dbos-inc/dbos-sdk";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  // Pass the nest router to DBOS so it can attach OTel tracing middlewares
  await DBOS.launch({ nestApp: app });
  // Nest must be set to listen on 3000 and external networks to run on DBOS Cloud
  await app.listen(3000, "0.0.0.0");
}

bootstrap().catch(err => {
    console.error('Failed to bootstrap application:', err);
    process.exit(1);
  });
