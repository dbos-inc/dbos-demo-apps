import { DBOS } from "@dbos-inc/dbos-sdk";
import { evaluateResults, generateFollowUps, shouldContinue } from "./agent";
import { searchHackerNews, getComments } from "./api";
import { synthesizeFindings, Finding } from "./llm";

export interface IterationResult {
  iteration: number;
  query: string;
  stories_found: number;
  comments_analyzed: number;
  evaluation: any;
  stories: any[];
  comments: any[];
}

export interface ResearchResult {
  topic: string;
  total_iterations: number;
  max_iterations: number;
  research_history: IterationResult[];
  final_report: any;
  summary: {
    total_stories: number;
    total_comments: number;
    queries_executed: string[];
    avg_relevance: number;
  };
}

async function agenticResearchWorkflowFunction(
  topic: string,
  maxIterations: number,
): Promise<ResearchResult> {
  console.log(`Starting agentic research for: ${topic}`);

  const allFindings: Finding[] = [];
  const researchHistory: IterationResult[] = [];
  let currentIteration = 0;
  let currentQuery = topic;

  // Main agentic research loop
  while (currentIteration < maxIterations) {
    currentIteration++;
    console.log(`🔄 Starting iteration ${currentIteration}/${maxIterations}`);

    // Research the next query
    const iterationResult = await researchQueryWorkflow(
      topic,
      currentQuery,
      currentIteration,
    );
    researchHistory.push(iterationResult);
    allFindings.push(iterationResult.evaluation);

    // Handle cases where no results are found
    const storiesFound = iterationResult.stories_found;
    if (storiesFound === 0) {
      console.log(
        `⚠️  No stories found for '${currentQuery}', trying alternative approach...`,
      );

      // Generate alternative queries when hitting dead ends
      const alternativeQuery = await DBOS.runStep(
        () => generateFollowUps(topic, allFindings, currentIteration),
        { name: "generateFollowUps" },
      );
      if (alternativeQuery) {
        currentQuery = alternativeQuery;
        console.log(`🔄 Retrying with: '${currentQuery}'`);
        continue;
      } else {
        console.log("❌ No alternative queries available, continuing...");
      }
    }

    // Evaluate whether to continue research
    console.log("🤔 Agent evaluating whether to continue research...");
    const shouldContinueDecision = await DBOS.runStep(
      () => shouldContinue(topic, allFindings, currentIteration, maxIterations),
      { name: "shouldContinue" },
    );
    if (!shouldContinueDecision) {
      console.log("✅ Agent decided to conclude research");
      break;
    }

    // Generate next research question based on findings
    if (currentIteration < maxIterations) {
      console.log("💭 Agent generating next research question...");
      const followUpQuery = await DBOS.runStep(
        () => generateFollowUps(topic, allFindings, currentIteration),
        { name: "generateFollowUps" },
      );
      if (followUpQuery) {
        currentQuery = followUpQuery;
        console.log(`➡️  Next research focus: '${currentQuery}'`);
      } else {
        console.log("💡 No new research directions found, concluding...");
        break;
      }
    }
  }

  // Final step: Synthesize all findings into comprehensive report
  console.log("📋 Agent synthesizing final research report...");
  const finalReport = await DBOS.runStep(
    () => synthesizeFindings(topic, allFindings),
    { name: "synthesizeFindings" },
  );

  // Return complete research results
  return {
    topic,
    total_iterations: currentIteration,
    max_iterations: maxIterations,
    research_history: researchHistory,
    final_report: finalReport,
    summary: {
      total_stories: researchHistory.reduce(
        (sum, r) => sum + r.stories_found,
        0,
      ),
      total_comments: researchHistory.reduce(
        (sum, r) => sum + r.comments_analyzed,
        0,
      ),
      queries_executed: researchHistory.map((r) => r.query),
      avg_relevance:
        allFindings.length > 0
          ? allFindings.reduce((sum, f) => sum + (f.relevance_score || 0), 0) /
            allFindings.length
          : 0,
    },
  };
}

async function researchQueryWorkflowFunction(
  topic: string,
  query: string,
  iteration: number,
): Promise<IterationResult> {
  console.log(`🔍 Searching for stories: '${query}'`);

  // Step 1: Search Hacker News for stories about the topic
  const stories = await DBOS.runStep(() => searchHackerNews(query, 30), {
    name: "searchHackerNews",
  });

  if (stories.length > 0) {
    console.log(`📚 Found ${stories.length} stories, analyzing all stories...`);
    stories.forEach((story, i) => {
      const title = (story.title || "No title").slice(0, 80);
      const points = story.points || 0;
      const numComments = story.num_comments || 0;
      console.log(
        `  📖 Story ${i + 1}: ${title}... (${points} points, ${numComments} comments)`,
      );
    });
  } else {
    console.log("❌ No stories found for this query");
  }

  // Step 2: Gather comments from all stories found
  const comments: any[] = [];
  if (stories.length > 0) {
    console.log(`💬 Reading comments from ALL ${stories.length} stories...`);

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      const storyId = story.objectID;
      const title = (story.title || "Unknown").slice(0, 50);
      const numComments = story.num_comments || 0;

      if (storyId && numComments > 0) {
        console.log(
          `  💭 Reading comments from: ${title}... (${numComments} comments)`,
        );
        const storyComments = await DBOS.runStep(
          () => getComments(storyId, 10),
          { name: "getComments" },
        );
        comments.push(...storyComments);
        console.log(`    ✓ Read ${storyComments.length} comments`);
      } else if (storyId) {
        console.log(`  📖 Story has no comments: ${title}`);
      } else {
        console.log(`  ❌ No story ID available for: ${title}`);
      }
    }
  }

  // Step 3: Evaluate gathered data and return findings
  console.log(
    `🤔 Analyzing findings from ${stories.length} stories and ${comments.length} comments...`,
  );
  const evaluation = await DBOS.runStep(
    () => evaluateResults(topic, query, stories, comments),
    { name: "evaluateResults" },
  );

  return {
    iteration,
    query,
    stories_found: stories.length,
    comments_analyzed: comments.length,
    evaluation,
    stories,
    comments,
  };
}

// Register DBOS workflows
export const agenticResearchWorkflow = DBOS.registerWorkflow(
  agenticResearchWorkflowFunction,
  { name: "agenticResearchWorkflow" },
);
export const researchQueryWorkflow = DBOS.registerWorkflow(
  researchQueryWorkflowFunction,
  { name: "researchQueryWorkflow" },
);
