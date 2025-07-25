import { callLLM, cleanJsonResponse, Finding, Story } from './llm';

export interface EvaluationResult {
  insights: string[];
  relevance_score: number;
  summary: string;
  key_points: string[];
  query: string;
  top_stories?: Story[];
}

export async function evaluateResults(
  topic: string,
  query: string,
  stories: any[],
  comments?: any[]
): Promise<EvaluationResult> {
  let storiesText = '';
  const topStories: Story[] = [];

  // Evaluate only the top 10 most relevant stories
  stories.slice(0, 10).forEach((story, i) => {
    const title = story.title || 'No title';
    const url = story.url || 'No URL';
    const hnUrl = `https://news.ycombinator.com/item?id=${story.objectID || ''}`;
    const points = story.points || 0;
    const numComments = story.num_comments || 0;
    const author = story.author || 'Unknown';

    storiesText += `Story ${i + 1}:\n`;
    storiesText += `  Title: ${title}\n`;
    storiesText += `  Points: ${points}, Comments: ${numComments}\n`;
    storiesText += `  URL: ${url}\n`;
    storiesText += `  HN Discussion: ${hnUrl}\n`;
    storiesText += `  Author: ${author}\n\n`;

    topStories.push({
      title,
      url,
      hn_url: hnUrl,
      points,
      num_comments: numComments,
      author,
      objectID: story.objectID || '',
    });
  });

  let commentsText = '';
  if (comments) {
    comments.slice(0, 20).forEach((comment, i) => {
      const commentText = comment.comment_text || '';
      if (commentText) {
        const author = comment.author || 'Unknown';
        const excerpt = commentText.length > 400 
          ? commentText.slice(0, 400) + '...'
          : commentText;

        commentsText += `Comment ${i + 1}:\n`;
        commentsText += `  Author: ${author}\n`;
        commentsText += `  Text: ${excerpt}\n\n`;
      }
    });
  }

  const prompt = `
    You are a research agent evaluating search results for: ${topic}
    
    Query used: ${query}
    
    Stories found:
    ${storiesText}
    
    Comments analyzed:
    ${commentsText}
    
    Provide a DETAILED analysis with specific insights, not generalizations. Focus on:
    - Specific technical details, metrics, or benchmarks mentioned
    - Concrete tools, libraries, frameworks, or techniques discussed
    - Interesting problems, solutions, or approaches described
    - Performance data, comparison results, or quantitative insights
    - Notable opinions, debates, or community perspectives
    - Specific use cases, implementation details, or real-world examples
    
    Return JSON with:
    - "insights": Array of specific, technical insights with context
    - "relevance_score": Number 1-10
    - "summary": Brief summary of findings
    - "key_points": Array of most important points discovered
    `;

  const messages = [
    {
      role: 'system' as const,
      content: 'You are a research evaluation agent. Analyze search results and provide structured insights in JSON format.',
    },
    { role: 'user' as const, content: prompt },
  ];

  try {
    const response = await callLLM(messages, 'gpt-4o-mini', 0.1, 2000);
    const cleanedResponse = cleanJsonResponse(response);
    const evaluation = JSON.parse(cleanedResponse);
    evaluation.query = query;
    evaluation.top_stories = topStories;
    return evaluation;
  } catch (error) {
    return {
      insights: [`Found ${stories.length} stories about ${topic}`],
      relevance_score: 7,
      summary: `Basic search results for ${query}`,
      key_points: [],
      query,
    };
  }
}

export async function generateFollowUps(
  topic: string,
  currentFindings: Finding[],
  iteration: number
): Promise<string | null> {
  let findingsSummary = '';
  currentFindings.forEach(finding => {
    findingsSummary += `Query: ${finding.query || 'Unknown'}\n`;
    findingsSummary += `Summary: ${finding.summary || 'No summary'}\n`;
    findingsSummary += `Key insights: ${JSON.stringify(finding.insights || [])}\n`;
    findingsSummary += `Unanswered questions: ${JSON.stringify(finding.unanswered_questions || [])}\n\n`;
  });

  const prompt = `
    You are a research agent investigating: ${topic}
    
    This is iteration ${iteration} of your research.
    
    Current findings:
    ${findingsSummary}
    
    Generate 2-4 SHORT KEYWORD-BASED search queries for Hacker News that explore DIVERSE aspects of ${topic}.
    
    CRITICAL RULES:
    1. Use SHORT keywords (2-4 words max) - NOT long sentences
    2. Focus on DIFFERENT aspects of ${topic}, not just one narrow area
    3. Use terms that appear in actual Hacker News story titles
    4. Avoid repeating previous focus areas
    5. Think about what tech people actually discuss about ${topic}
    
    For ${topic}, consider diverse areas like:
    - Performance/optimization
    - Tools/extensions
    - Comparisons with other technologies
    - Use cases/applications
    - Configuration/deployment
    - Recent developments
    
    GOOD examples: ["postgres performance", "database tools", "sql optimization"]
    BAD examples: ["What are the best practices for PostgreSQL optimization?"]
    
    Return only a JSON array of SHORT keyword queries: ["query1", "query2", "query3"]
    `;

  const messages = [
    {
      role: 'system' as const,
      content: 'You are a research agent. Generate focused follow-up queries based on current findings. Return only JSON array.',
    },
    { role: 'user' as const, content: prompt },
  ];

  try {
    const response = await callLLM(messages);
    const cleanedResponse = cleanJsonResponse(response);
    const queries = JSON.parse(cleanedResponse);
    return Array.isArray(queries) && queries.length > 0 ? queries[0] : null;
  } catch (error) {
    return null;
  }
}

export async function shouldContinue(
  topic: string,
  allFindings: Finding[],
  currentIteration: number,
  maxIterations: number
): Promise<boolean> {
  if (currentIteration >= maxIterations) {
    return false;
  }

  let findingsSummary = '';
  let totalRelevance = 0;
  
  allFindings.forEach(finding => {
    findingsSummary += `Query: ${finding.query || 'Unknown'}\n`;
    findingsSummary += `Summary: ${finding.summary || 'No summary'}\n`;
    findingsSummary += `Relevance: ${finding.relevance_score || 5}/10\n`;
    totalRelevance += finding.relevance_score || 5;
  });

  const avgRelevance = allFindings.length > 0 ? totalRelevance / allFindings.length : 0;

  const prompt = `
    You are a research agent investigating: ${topic}
    
    Current iteration: ${currentIteration}/${maxIterations}
    
    Findings so far:
    ${findingsSummary}
    
    Average relevance score: ${avgRelevance.toFixed(1)}/10
    
    Decide whether to continue research or conclude. PRIORITIZE THOROUGH EXPLORATION - continue if:
    1. Current iteration is less than 75% of max_iterations
    2. Average relevance is above 6.0 and there are likely unexplored aspects
    3. Recent queries found significant new information
    4. The research seems to be discovering diverse perspectives on the topic
    
    Only stop early if:
    - Average relevance is below 5.0 for multiple iterations
    - No new meaningful information in the last 2 iterations
    - Research appears to be hitting diminishing returns
    
    Return JSON with:
    - "should_continue": boolean
    `;

  const messages = [
    {
      role: 'system' as const,
      content: 'You are a research decision agent. Evaluate research completeness and decide whether to continue. Return JSON.',
    },
    { role: 'user' as const, content: prompt },
  ];

  try {
    const response = await callLLM(messages);
    const cleanedResponse = cleanJsonResponse(response);
    const decision = JSON.parse(cleanedResponse);
    return decision.should_continue || true;
  } catch (error) {
    return true;
  }
}

