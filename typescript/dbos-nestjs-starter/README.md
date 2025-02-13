# Nest x DBOS

This Sample app shows how to use DBOS workflows with a nest.js app, specifically allowing you to transform existing `Injectable` services into reliable DBOS workflows.

First, configure main.ts to start DBOS (optionally register the nest application to attach the DBOS tracing middlewares):

```typescript
// main.ts
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
    new FastifyAdapter()
  );
  await DBOS.launch({ nestApp: app });
  await app.listen(8000);
}

bootstrap();
```

Now, let's declare an `Injectable` Nest service implementing DBOS operations. *The class must `extends ConfiguredInstances`*.
The DBOS workflow has two steps: fetch an external API and insert a record in the database.

```typescript
//app.service.ts
import { Injectable } from "@nestjs/common";
import { ConfiguredInstance, DBOS, InitContext } from "@dbos-inc/dbos-sdk";
import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';

interface GreetingRecord {
  greeting_name: string;
  greeting_note_content: string;
}

@Injectable()
export class AppService extends ConfiguredInstance {
  constructor(name: string) {
    super(name);
  }

  async initialize(ctx: InitContext): Promise<void> {
    DBOS.logger.info(`Initializing DBOS provider {this.name}`);
  }

  @DBOS.workflow()
  async getHello() {
    DBOS.logger.info("Hello from a wf");
    await this.sendHTTPrequest();
    const res = await this.insert();
    return JSON.stringify(res);
  }

  @DBOS.step()
  async sendHTTPrequest() {
    const response = await fetch("https://example.com");
    const data = await response.text();
    return data;
  }

  @DBOS.transaction()
  async insert(): Promise<string> {
      const randomName: string = uniqueNamesGenerator({
        dictionaries: [adjectives, colors, animals],
        separator: '-',
        length: 2,
        style: 'capital',
      });
      return await DBOS.knexClient<GreetingRecord>("dbos_greetings").insert(
          { greeting_name: randomName, greeting_note_content: "Hello World!" },
          ["greeting_name", "greeting_note_content"],
      )
  }
}
```

The controller simply exposes one endpoint calling the service:

```typescript
// app.controller.ts
import { Controller, Get, Inject } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(
    @Inject('dbosProvider') private readonly appService: AppService,
) {}

  @Get()
  async getHello(): Promise<string> {
    return this.appService.getHello();
  }
}
```

Finally, the `app.module.ts` does the important job of instantiating and registering the appService provider.

```typescript
// app.module.ts
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { Provider } from "@nestjs/common/interfaces";

// Make a Nest provider out of a DBOS ConfiguredInstance class
export function createDBOSProvider(token: string, name: string): Provider {
    return {
      provide: token,
      useFactory: () => {
        return DBOS.configureInstance(AppService, name);
      },
      inject: [],
    };
  }
const dbosProvider = createDBOSProvider("dbosProvider", "appservice");

@Module({
  imports: [],
  providers: [dbosProvider],
  controllers: [AppController],
})

export class AppModule {}
```