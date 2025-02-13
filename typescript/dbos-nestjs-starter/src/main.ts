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
  await DBOS.launch({ nestApp: app }); // Pass the nest router to DBOS so it can attach OTel tracing middlewares
  await app.listen(3000, '0.0.0.0'); // Nest must be set to listen on 3000 and external networks to run on DBOS Cloud
}

bootstrap();
