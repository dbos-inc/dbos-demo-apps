import { DBOS } from "@dbos-inc/dbos-sdk";
import { testTasks } from "../src/dbos/tasks";
import request from "supertest";
import { DBOSBored, dkoa } from "../src/dbos/dbos_bored";
import Koa from 'koa';
import Router from '@koa/router';

describe("tasks", () => {
  let app: Koa;
  let router: Router;

  beforeAll(async () => {
    app = new Koa;
    router = new Router();
    dkoa.registerWithApp(app, router);
    await DBOS.launch();
  });

  afterAll(async () => {
    await DBOS.shutdown();
  });

  test("runAllTasks", async() => {
    try {
      await testTasks();
    }
    catch (e) {
      console.log(e);
    }
  });

  test("tryDBOSEndpoint", async() => {
    const resp1 = await request(app.callback()!)
      .get("/dbos/boredapi/activity");
    expect(resp1.status).toBe(200);
  });

  test("tryDBOSFunciton", async() => {
    const resp1 = await DBOSBored.getActivity();
    expect(resp1).toBeDefined();
  });
});

