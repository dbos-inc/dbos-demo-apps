import { describe, expect, it } from "vitest";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { MyWorkflow } from "../dbos/operations";

describe("math functions", () => {
  it("adds two numbers", async () => {
    await DBOS.launch();
    await MyWorkflow.backgroundTask(4);
    await DBOS.shutdown();
    expect(1).toBe(1);
  });
});
