// app.module.ts
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { Provider } from "@nestjs/common/interfaces";

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
