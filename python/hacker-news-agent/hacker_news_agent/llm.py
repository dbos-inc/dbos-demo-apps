"""LLM integration for agentic workflows using DBOS.

Demonstrates how to build durable LLM-powered agents with DBOS step functions.
Each LLM call is wrapped in @DBOS.step() for automatic retries and durability.
"""

import json
import os
from typing import Any, Dict, List

from dbos import DBOS
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables and initialize OpenAI client
load_dotenv()
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# LLM configuration
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPERATURE = 0.1
DEFAULT_MAX_TOKENS = 2000


def call_llm(
    messages: List[Dict[str, str]],
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> str:
    """Core LLM API call wrapped as a durable DBOS step.

    The @DBOS.step() decorator makes this function durable - if it fails,
    DBOS will automatically retry it. This is essential for building reliable
    agents that can recover from transient failures.
    """
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
    except Exception as e:
        raise Exception(f"LLM API call failed: {str(e)}")


def _clean_json_response(response: str) -> str:
    """Clean LLM response to extract valid JSON.

    LLMs often return JSON wrapped in markdown code blocks.
    This utility function strips that formatting for reliable parsing.
    """
    cleaned = response.strip()

    # Remove markdown code blocks
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


@DBOS.step()
def synthesize_findings_step(
    topic: str, all_findings: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Synthesize all research findings into a comprehensive report."""
    findings_text = ""
    story_links = []

    for i, finding in enumerate(all_findings, 1):
        findings_text += f"\n=== Finding {i} ===\n"
        findings_text += f"Query: {finding.get('query', 'Unknown')}\n"
        findings_text += f"Summary: {finding.get('summary', 'No summary')}\n"
        findings_text += f"Key Points: {finding.get('key_points', [])}\n"
        findings_text += f"Insights: {finding.get('insights', 'No insights')}\n"

        # Extract story links and details for reference
        if finding.get("top_stories"):
            for story in finding["top_stories"]:
                story_links.append(
                    {
                        "title": story.get("title", "Unknown"),
                        "url": story.get("url", ""),
                        "hn_url": f"https://news.ycombinator.com/item?id={story.get('objectID', '')}",
                        "points": story.get("points", 0),
                        "comments": story.get("num_comments", 0),
                    }
                )

    # Build comprehensive story and citation data
    story_citations = {}
    citation_id = 1

    for finding in all_findings:
        if finding.get("top_stories"):
            for story in finding["top_stories"]:
                story_id = story.get("objectID", "")
                if story_id and story_id not in story_citations:
                    story_citations[story_id] = {
                        "id": citation_id,
                        "title": story.get("title", "Unknown"),
                        "url": story.get("url", ""),
                        "hn_url": story.get("hn_url", ""),
                        "points": story.get("points", 0),
                        "comments": story.get("num_comments", 0),
                    }
                    citation_id += 1

    # Create citation references text
    citations_text = "\n".join(
        [
            f"[{cite['id']}] {cite['title']} ({cite['points']} points, {cite['comments']} comments) - {cite['hn_url']}"
            + (f" - {cite['url']}" if cite["url"] else "")
            for cite in story_citations.values()
        ]
    )

    prompt = f"""
    You are a research analyst. Synthesize the following research findings into a comprehensive, detailed report about: {topic}
    
    Research Findings:
    {findings_text}
    
    Available Citations:
    {citations_text}
    
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
    {{
        "report": "A comprehensive research report written as flowing narrative text with inline clickable links [like this](https://news.ycombinator.com/item?id=123). Include specific technical details, tools, performance metrics, community opinions, and actionable insights. Make it detailed and informative, not just a summary."
    }}
    """

    messages = [
        {
            "role": "system",
            "content": "You are a research analyst. Provide comprehensive synthesis in JSON format.",
        },
        {"role": "user", "content": prompt},
    ]

    response = call_llm(messages, max_tokens=3000)

    try:
        cleaned_response = _clean_json_response(response)
        result = json.loads(cleaned_response)
        return result
    except json.JSONDecodeError as e:
        # Agent resilience: Create fallback synthesis if LLM output can't be parsed
        basic_insights = []
        for finding in all_findings:
            insights = finding.get("insights", [])
            if insights:
                basic_insights.extend(insights[:2])

        basic_report = f"Research on {topic} revealed {len(all_findings)} key areas of investigation with varying levels of activity and discussion."
        if basic_insights:
            basic_report += f" Key insights include: {'; '.join(basic_insights[:3])}."

        return {
            "report": basic_report,
            "error": f"JSON parsing failed, created basic synthesis. Error: {str(e)}",
        }
