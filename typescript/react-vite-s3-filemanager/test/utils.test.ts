// tests/math.test.ts
import { describe, expect, it } from "vitest";
import { add } from "../dbos/utils";

describe("math functions", () => {
  it("adds two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });
});
