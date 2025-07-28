#!/usr/bin/env node

import { main } from "./cli";

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
