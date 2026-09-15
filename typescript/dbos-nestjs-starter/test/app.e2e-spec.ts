import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    DBOS.setConfig({
      name: 'dbos-nestjs-starter',
      systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
    });
    await DBOS.launch();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await DBOS.shutdown();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
