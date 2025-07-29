#!/usr/bin/env node

import { Command } from "commander";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { agenticResearchWorkflow, ResearchResult } from "./workflows";
import { randomUUID } from "crypto";

const program = new Command();

function formatOutput(result: ResearchResult): void {
  console.log("\n🤖 Agent Reasoning Process");

  // Show how the agent iteratively refined its research
  const researchHistory = result.research_history;
  if (researchHistory.length > 0) {
    console.log("\n🔄 Research Iterations:");

    researchHistory.forEach((iteration) => {
      const iterNum = iteration.iteration;
      const query = iteration.query;
      const evaluation = iteration.evaluation;

      console.log(`\n  Iteration ${iterNum}: ${query}`);
      console.log(
        `    Stories: ${iteration.stories_found}, Comments: ${iteration.comments_analyzed}`,
      );
      console.log(`    Relevance: ${evaluation.relevance_score || 0}/10`);
    });
  }

  // Display final research results
  const topic = result.topic;
  const summary = result.summary;
  const finalReport = result.final_report;

  console.log(`\n📊 Research Report: ${topic}`);
  console.log("=".repeat(60));

  // Show research statistics
  console.log("\n🔍 Research Summary:");
  console.log(`  • Total Iterations: ${result.total_iterations}`);
  console.log(`  • Stories Analyzed: ${summary.total_stories}`);
  console.log(`  • Comments Analyzed: ${summary.total_comments}`);
  console.log(`  • Average Relevance: ${summary.avg_relevance.toFixed(1)}/10`);

  // Show the agent's research progression
  const queries = summary.queries_executed;
  if (queries.length > 0) {
    console.log("\n🔎 Queries Executed:");
    queries.forEach((query, i) => {
      console.log(`  ${i + 1}. ${query}`);
    });
  }

  // Display the agent's synthesized report
  const reportText = finalReport.report || "";
  if (reportText) {
    console.log("\n📊 Research Report:");
    console.log("─".repeat(60));
    console.log(reportText);
    console.log("─".repeat(60));
  }

  console.log("\n" + "=".repeat(60));
  console.log("Research completed by Hacker News Research Agent");
}

async function runResearch(
  topic: string,
  options: { maxIterations: number; workflowId?: string },
) {
  // Validate required environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Error: OPENAI_API_KEY environment variable not set");
    console.error("Please set your OpenAI API key:");
    console.error("  export OPENAI_API_KEY='your-api-key-here'");
    process.exit(1);
  }

  try {
    // Initialize DBOS
    DBOS.setConfig({
      name: "hacker-news-agent-node",
      databaseUrl:
        process.env.DBOS_SYSTEM_DATABASE_URL ||
        "postgresql://postgres:dbos@localhost:5432/hacker_news_agent_node_dbos_sys",
    });
    await DBOS.launch({ conductorKey: process.env.CONDUCTOR_KEY });

    // Launch the agentic research workflow
    console.log("\n🤖 Starting Agentic Research Agent");
    console.log("The agent will autonomously plan and execute research...\n");

    // Resume if a workflow ID is provided, else generate a new one
    let workflowId: string;
    let handle: any;

    if (options.workflowId) {
      workflowId = options.workflowId;
      console.log(`📋 Resuming workflow ID: ${workflowId}`);

      try {
        handle = await DBOS.retrieveWorkflow(workflowId);
        if (!handle) {
          console.error(`❌ Error: Workflow ID ${workflowId} not found`);
          process.exit(1);
        }
      } catch (error) {
        console.error(`❌ Error retrieving workflow ${workflowId}: ${error}`);
        process.exit(1);
      }
    } else {
      workflowId = randomUUID();
      console.log(`📋 Workflow ID: ${workflowId}`);
      console.log(`Use --workflow-id ${workflowId} to resume if interrupted\n`);

      handle = await DBOS.startWorkflow(agenticResearchWorkflow, {
        workflowID: workflowId,
      })(topic, options.maxIterations);
    }

    const result = await handle.getResult();

    // Display the results
    formatOutput(result);

    console.log("\n✅ Research completed successfully!");
    await DBOS.shutdown();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.log("\n🟡 Research interrupted by user");
    } else {
      console.error(`\n❌ Error during research: ${error}`);
    }

    process.exit(1);
  }
}

export async function main() {
  program
    .name("hacker-news-agent")
    .description(
      "Autonomous AI research agent that explores topics on Hacker News",
    )
    .version("1.0.0")
    .argument("<topic>", "Topic to research on Hacker News")
    .option("-i, --max-iterations <number>", "Maximum research iterations", "8")
    .option(
      "--workflow-id <id>",
      "Workflow ID to resume a previous research session",
    )
    .action(async (topic: string, options) => {
      const maxIterations = parseInt(options.maxIterations, 10);
      if (isNaN(maxIterations) || maxIterations < 1) {
        console.error("❌ Error: max-iterations must be a positive number");
        process.exit(1);
      }
      await runResearch(topic, {
        maxIterations,
        workflowId: options.workflowId,
      });
    });

  program.parse();
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n🟡 Research interrupted by user");
  process.exit(1);
});
