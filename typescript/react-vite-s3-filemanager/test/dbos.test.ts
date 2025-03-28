import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { DBOS, parseConfigFile } from "@dbos-inc/dbos-sdk";
import { MyWorkflow } from "../dbos/operations";

describe("dbos functions", () => {
  beforeEach(async () => {
    const [config] = parseConfigFile();
    DBOS.setConfig(config); // Could do something else here, since this is a test
    await DBOS.launch();
  });

  afterEach(async () => {
    await DBOS.shutdown();
  });

  it("runs-dbos-code", async () => {
    await MyWorkflow.backgroundTask(4);
    expect(1).toBe(1);
  });
});
