import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_MAX_TOKENS = 2000;

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callLLM(
  messages: Message[],
  model: string = DEFAULT_MODEL,
  temperature: number = DEFAULT_TEMPERATURE,
  maxTokens: number = DEFAULT_MAX_TOKENS
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    });
    
    return response.choices[0]?.message?.content || '';
  } catch (error) {
    throw new Error(`LLM API call failed: ${error}`);
  }
}

export function cleanJsonResponse(response: string): string {
  let cleaned = response.trim();
  
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  return cleaned.trim();
}

export interface Finding {
  query?: string;
  summary?: string;
  insights?: string[];
  key_points?: string[];
  relevance_score?: number;
  top_stories?: Story[];
  unanswered_questions?: string[];
}

export interface Story {
  title?: string;
  url?: string;
  hn_url?: string;
  points?: number;
  num_comments?: number;
  author?: string;
  objectID?: string;
}

export interface SynthesisResult {
  report: string;
  error?: string;
}

export async function synthesizeFindingsStep(
  topic: string,
  allFindings: Finding[]
): Promise<SynthesisResult> {
  let findingsText = '';
  const storyLinks: Story[] = [];

  allFindings.forEach((finding, i) => {
    findingsText += `\n=== Finding ${i + 1} ===\n`;
    findingsText += `Query: ${finding.query || 'Unknown'}\n`;
    findingsText += `Summary: ${finding.summary || 'No summary'}\n`;
    findingsText += `Key Points: ${JSON.stringify(finding.key_points || [])}\n`;
    findingsText += `Insights: ${JSON.stringify(finding.insights || [])}\n`;

    if (finding.top_stories) {
      finding.top_stories.forEach(story => {
        storyLinks.push({
          title: story.title || 'Unknown',
          url: story.url || '',
          hn_url: `https://news.ycombinator.com/item?id=${story.objectID || ''}`,
          points: story.points || 0,
          num_comments: story.num_comments || 0,
        });
      });
    }
  });

  const storyCitations: Record<string, any> = {};
  let citationId = 1;

  allFindings.forEach(finding => {
    if (finding.top_stories) {
      finding.top_stories.forEach(story => {
        const storyId = story.objectID || '';
        if (storyId && !storyCitations[storyId]) {
          storyCitations[storyId] = {
            id: citationId,
            title: story.title || 'Unknown',
            url: story.url || '',
            hn_url: story.hn_url || '',
            points: story.points || 0,
            comments: story.num_comments || 0,
          };
          citationId++;
        }
      });
    }
  });

  const citationsText = Object.values(storyCitations)
    .map(cite => 
      `[${cite.id}] ${cite.title} (${cite.points} points, ${cite.comments} comments) - ${cite.hn_url}` +
      (cite.url ? ` - ${cite.url}` : '')
    )
    .join('\n');

  const prompt = `
    You are a research analyst. Synthesize the following research findings into a comprehensive, detailed report about: ${topic}
    
    Research Findings:
    ${findingsText}
    
    Available Citations:
    ${citationsText}
    
    IMPORTANT: You must return ONLY a valid JSON object with no additional text, explanations, or formatting.
    
    Create a comprehensive research report that flows naturally as a single narrative. Include:
    - Specific technical details and concrete examples
    - Actionable insights practitioners can use
    - Interesting discoveries and surprising findings
    - Specific tools, libraries, or techniques mentioned
    - Performance metrics, benchmarks, or quantitative data when available
    - Notable opinions or debates in the community
    - INLINE LINKS: When making claims, include clickable links directly in the text using this format: [link text](HN_URL)
    - Use MANY inline links throughout the report. Aim for at least 4-5 links per paragraph.
    
    CRITICAL CITATION RULES - FOLLOW EXACTLY:
    
    1. NEVER replace words with bare URLs like "(https://news.ycombinator.com/item?id=123)"
    2. ALWAYS write complete sentences with all words present
    3. Add citations using descriptive link text in brackets: [descriptive text](URL)
    4. Every sentence must be grammatically complete and readable without the links
    5. Links should ALWAYS be to the Hacker News discussion, NEVER directly to the article.
    
    CORRECT examples:
    "PostgreSQL's performance improvements have been significant in recent versions, as discussed in [community forums](https://news.ycombinator.com/item?id=123456), with developers highlighting [specific optimizations](https://news.ycombinator.com/item?id=789012) in query processing."
    
    "Redis performance issues can stem from common configuration mistakes, which are well-documented in [troubleshooting guides](https://news.ycombinator.com/item?id=345678) and [community discussions](https://news.ycombinator.com/item?id=901234)."
    
    "React's licensing changes have sparked significant community debate, as seen in [detailed discussions](https://news.ycombinator.com/item?id=15316175) about the implications for open-source projects."
    
    WRONG examples (NEVER DO THIS):
    "Community discussions reveal a strong interest in the (https://news.ycombinator.com/item?id=18717168) and the common pitfalls"
    "One significant topic is the (https://news.ycombinator.com/item?id=15316175), which raises important legal considerations"
    
    Always link to relevant discussions for:
    - Every specific tool, library, or technology mentioned
    - Performance claims and benchmarks  
    - Community opinions and debates
    - Technical implementation details
    - Companies or projects referenced
    - Version releases or updates
    - Problem reports or solutions
    
    Return a JSON object with this exact structure:
    {
        "report": "A comprehensive research report written as flowing narrative text with inline clickable links [like this](https://news.ycombinator.com/item?id=123). Include specific technical details, tools, performance metrics, community opinions, and actionable insights. Make it detailed and informative, not just a summary."
    }
    `;

  const messages: Message[] = [
    {
      role: 'system',
      content: 'You are a research analyst. Provide comprehensive synthesis in JSON format.',
    },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await callLLM(messages, DEFAULT_MODEL, DEFAULT_TEMPERATURE, 3000);
    const cleanedResponse = cleanJsonResponse(response);
    const result = JSON.parse(cleanedResponse);
    return result;
  } catch (error) {
    return {
      report: 'JSON parsing error, report could not be generated.',
      error: `JSON parsing failed, created basic synthesis. Error: ${error}`,
    };
  }
}