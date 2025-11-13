import { Module, Provider } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

export const appProvider: Provider = {
  provide: AppService,
  useFactory: () => {
    const service = new AppService('dbos-service-instance');
    return service;
  },
};

@Module({
  imports: [],
  controllers: [AppController],
  providers: [appProvider],
})
export class AppModule {}
