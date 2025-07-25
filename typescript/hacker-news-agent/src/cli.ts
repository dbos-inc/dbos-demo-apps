#!/usr/bin/env node

import { agenticResearchWorkflow, ResearchResult } from './workflows';
import * as dotenv from 'dotenv';

dotenv.config();

interface Args {
  topic: string;
  maxIterations: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm start <topic> [options]

Arguments:
  topic                 Topic to research on Hacker News

Options:
  --max-iterations NUM  Maximum research iterations (default: 8)
  --help, -h           Show this help message

Examples:
  npm start "PostgreSQL performance"
  npm start "React hooks" --max-iterations 5
    `);
    process.exit(0);
  }

  let topic = '';
  let maxIterations = 8;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-iterations') {
      const next = args[i + 1];
      if (next && !isNaN(parseInt(next))) {
        maxIterations = parseInt(next);
        i++; // skip next arg
      }
    } else if (!args[i].startsWith('--')) {
      if (!topic) {
        topic = args[i];
      }
    }
  }

  if (!topic) {
    console.error('❌ Error: Topic is required');
    process.exit(1);
  }

  return { topic, maxIterations };
}

function formatOutput(result: ResearchResult): void {
  console.log('\n🤖 Agent Reasoning Process');

  // Show how the agent iteratively refined its research
  const researchHistory = result.research_history;
  if (researchHistory.length > 0) {
    console.log('\n🔄 Research Iterations:');

    researchHistory.forEach(iteration => {
      const iterNum = iteration.iteration;
      const query = iteration.query;
      const evaluation = iteration.evaluation;

      console.log(`\n  Iteration ${iterNum}: ${query}`);
      console.log(`    Stories: ${iteration.stories_found}, Comments: ${iteration.comments_analyzed}`);
      console.log(`    Relevance: ${evaluation.relevance_score || 0}/10`);
    });
  }

  // Display final research results
  const topic = result.topic;
  const summary = result.summary;
  const finalReport = result.final_report;

  console.log(`\n📊 Research Report: ${topic}`);
  console.log('='.repeat(60));

  // Show research statistics
  console.log('\n🔍 Research Summary:');
  console.log(`  • Total Iterations: ${result.total_iterations}`);
  console.log(`  • Stories Analyzed: ${summary.total_stories}`);
  console.log(`  • Comments Analyzed: ${summary.total_comments}`);
  console.log(`  • Average Relevance: ${summary.avg_relevance.toFixed(1)}/10`);

  // Show the agent's research progression
  const queries = summary.queries_executed;
  if (queries.length > 0) {
    console.log('\n🔎 Queries Executed:');
    queries.forEach((query, i) => {
      console.log(`  ${i + 1}. ${query}`);
    });
  }

  // Display the agent's synthesized report
  const reportText = finalReport.report || '';
  if (reportText) {
    console.log('\n📊 Research Report:');
    console.log('─'.repeat(60));
    console.log(reportText);
    console.log('─'.repeat(60));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Research completed by Hacker News Research Agent');
}

export async function main() {
  // Validate required environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable not set');
    console.error('Please set your OpenAI API key:');
    console.error('  export OPENAI_API_KEY=\'your-api-key-here\'');
    process.exit(1);
  }

  const args = parseArgs();

  try {
    // Launch the agentic research workflow
    console.log('\n🤖 Starting Agentic Research Agent');
    console.log('The agent will autonomously plan and execute research...\n');

    const result = await agenticResearchWorkflow(args.topic, args.maxIterations);

    // Display the results
    formatOutput(result);

    console.log('\n✅ Research completed successfully!');

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('\n🟡 Research interrupted by user');
      process.exit(1);
    } else {
      console.error(`\n❌ Error during research: ${error}`);
      process.exit(1);
    }
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🟡 Research interrupted by user');
  process.exit(1);
});