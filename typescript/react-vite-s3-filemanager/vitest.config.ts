import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // Use "node" for backend tests
    include: ["test/**/*.test.ts"], // Adjust this to match your test file locations
  },
});
