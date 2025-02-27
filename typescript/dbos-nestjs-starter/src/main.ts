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
  // You can also use an environment variables in dbos-config.yaml to set the port
  await app.listen(DBOS.runtimeConfig?.port || 3000, "0.0.0.0");
}

bootstrap();
