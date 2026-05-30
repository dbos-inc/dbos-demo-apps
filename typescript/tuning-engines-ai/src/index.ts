#!/usr/bin/env node

import { Command } from "commander";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { randomUUID } from "crypto";
import { governedAiWorkflow, GovernedAiResult } from "./workflows";

const program = new Command();

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function printResult(result: GovernedAiResult): void {
  console.log("\nTuning Engines response");
  console.log("=".repeat(60));
  console.log(result.content);
  console.log("=".repeat(60));
  console.log(`run_id: ${result.run_id}`);
  console.log(`request_id: ${result.request_id}`);
  console.log(`trace_status: ${result.trace_status}`);
}

async function run(prompt: string, options: { workflowId?: string }): Promise<void> {
  if (!process.env.TE_INFERENCE_KEY) {
    console.error("TE_INFERENCE_KEY is required.");
    process.exit(1);
  }

  DBOS.setConfig({
    name: "tuning-engines-ai",
    applicationVersion: "1.0.0",
    systemDatabaseUrl:
      process.env.DBOS_SYSTEM_DATABASE_URL ||
      "postgresql://postgres:dbos@localhost:5432/tuning_engines_ai_dbos_sys",
  });
  await DBOS.launch({ conductorKey: process.env.CONDUCTOR_KEY });

  const workflowId = options.workflowId || newId("dbos");
  console.log(`Workflow ID: ${workflowId}`);

  const handle = options.workflowId
    ? await DBOS.retrieveWorkflow(workflowId)
    : await DBOS.startWorkflow(governedAiWorkflow, { workflowID: workflowId })({
        prompt,
        run_id: workflowId,
      });

  const result = (await handle.getResult()) as GovernedAiResult;
  printResult(result);
  await DBOS.shutdown();
}

program
  .name("tuning-engines-ai")
  .description("Run a durable DBOS workflow that calls Tuning Engines")
  .argument("<prompt>", "Prompt to send to the governed model endpoint")
  .option("--workflow-id <id>", "Resume an existing DBOS workflow")
  .action((prompt: string, options: { workflowId?: string }) => {
    run(prompt, options).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });

program.parse();
