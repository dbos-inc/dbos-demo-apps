import { DBOS } from "@dbos-inc/dbos-sdk";
import { testTasks } from "../src/dbos/tasks";
import request from "supertest";
import { DBOSBored } from "../src/dbos/dbos_bored";

describe("tasks", () => {

  beforeAll(async () => {
    await DBOS.launch();
    DBOS.setUpHandlerCallback();
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
    const resp1 = await request(DBOS.getHTTPHandlersCallback()!)
      .get("/dbos/boredapi/activity");
    expect(resp1.status).toBe(200);
  });

  test("tryDBOSFunciton", async() => {
    const resp1 = await DBOSBored.getActivity();
    expect(resp1).toBeDefined();
  });
});

