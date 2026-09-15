import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { appProvider } from './app.module';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [appProvider],
    }).compile();

    appController = app.get<AppController>(AppController);
    DBOS.setConfig({
      name: 'dbos-nestjs-starter',
      systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
    });
    await DBOS.launch();
  });

  afterEach(async () => {
    await DBOS.shutdown();
  });

  describe('root', () => {
    it('should return "Hello World!"', async () => {
      expect(await appController.runWorkflow()).toBe('Hello World!');
    });
  });
});
