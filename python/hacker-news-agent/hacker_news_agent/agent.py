import json
from typing import Any, Dict, List, Optional

from dbos import DBOS

from .llm import call_llm, clean_json_response


@DBOS.step()
def evaluate_results_step(
    topic: str,
    query: str,
    stories: List[Dict[str, Any]],
    comments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Agent evaluates search results and extracts insights."""

    # Prepare content for analysis
    content_summary = f"Found {len(stories)} stories"
    if comments:
        content_summary += f" and {len(comments)} comments"

    # Create detailed content digest for LLM
    stories_text = ""
    top_stories = []

    # Evaluate only the top 10 most relevant (per HN search) stories
    for i, story in enumerate(stories[:10]):
        title = story.get("title", "No title")
        url = story.get("url", "No URL")
        hn_url = f"https://news.ycombinator.com/item?id={story.get('objectID', '')}"
        points = story.get("points", 0)
        num_comments = story.get("num_comments", 0)
        author = story.get("author", "Unknown")

        stories_text += f"Story {i+1}:\n"
        stories_text += f"  Title: {title}\n"
        stories_text += f"  Points: {points}, Comments: {num_comments}\n"
        stories_text += f"  URL: {url}\n"
        stories_text += f"  HN Discussion: {hn_url}\n"
        stories_text += f"  Author: {author}\n\n"

        # Store top stories for reference
        top_stories.append(
            {
                "title": title,
                "url": url,
                "hn_url": hn_url,
                "points": points,
                "num_comments": num_comments,
                "author": author,
                "objectID": story.get("objectID", ""),
            }
        )

    comments_text = ""

    if comments:
        for i, comment in enumerate(comments[:20]):  # Limit to top 20 comments
            comment_text = comment.get("comment_text", "")
            if comment_text:
                author = comment.get("author", "Unknown")
                # Get longer excerpts for better analysis
                excerpt = (
                    comment_text[:400] + "..."
                    if len(comment_text) > 400
                    else comment_text
                )

                comments_text += f"Comment {i+1}:\n"
                comments_text += f"  Author: {author}\n"
                comments_text += f"  Text: {excerpt}\n\n"

    prompt = f"""
    You are a research agent evaluating search results for: {topic}
    
    Query used: {query}
    
    Stories found:
    {stories_text}
    
    Comments analyzed:
    {comments_text}
    
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
    """

    messages = [
        {
            "role": "system",
            "content": "You are a research evaluation agent. Analyze search results and provide structured insights in JSON format.",
        },
        {"role": "user", "content": prompt},
    ]

    response = call_llm(messages, max_tokens=2000)

    try:
        cleaned_response = clean_json_response(response)
        evaluation = json.loads(cleaned_response)
        evaluation["query"] = query
        evaluation["top_stories"] = top_stories
        return evaluation
    except json.JSONDecodeError:
        return {
            "insights": [f"Found {len(stories)} stories about {topic}"],
            "relevance_score": 7,
            "summary": f"Basic search results for {query}",
            "key_points": [],
            "query": query,
        }


@DBOS.step()
def generate_follow_ups_step(
    topic: str, current_findings: List[Dict[str, Any]], iteration: int
) -> Optional[str]:
    """Agent generates follow-up research queries based on current findings."""

    findings_summary = ""
    for finding in current_findings:
        findings_summary += f"Query: {finding.get('query', 'Unknown')}\n"
        findings_summary += f"Summary: {finding.get('summary', 'No summary')}\n"
        findings_summary += f"Key insights: {finding.get('insights', [])}\n"
        findings_summary += (
            f"Unanswered questions: {finding.get('unanswered_questions', [])}\n\n"
        )

    prompt = f"""
    You are a research agent investigating: {topic}
    
    This is iteration {iteration} of your research.
    
    Current findings:
    {findings_summary}
    
    Generate 2-4 SHORT KEYWORD-BASED search queries for Hacker News that explore DIVERSE aspects of {topic}.
    
    CRITICAL RULES:
    1. Use SHORT keywords (2-4 words max) - NOT long sentences
    2. Focus on DIFFERENT aspects of {topic}, not just one narrow area
    3. Use terms that appear in actual Hacker News story titles
    4. Avoid repeating previous focus areas
    5. Think about what tech people actually discuss about {topic}
    
    For {topic}, consider diverse areas like:
    - Performance/optimization
    - Tools/extensions
    - Comparisons with other technologies
    - Use cases/applications
    - Configuration/deployment
    - Recent developments
    
    GOOD examples: ["postgres performance", "database tools", "sql optimization"]
    BAD examples: ["What are the best practices for PostgreSQL optimization?"]
    
    Return only a JSON array of SHORT keyword queries: ["query1", "query2", "query3"]
    """

    messages = [
        {
            "role": "system",
            "content": "You are a research agent. Generate focused follow-up queries based on current findings. Return only JSON array.",
        },
        {"role": "user", "content": prompt},
    ]

    response = call_llm(messages)

    try:
        cleaned_response = clean_json_response(response)
        queries = json.loads(cleaned_response)
        return queries[0] if isinstance(queries, list) and len(queries) > 0 else None
    except json.JSONDecodeError:
        return None


@DBOS.step()
def should_continue_step(
    topic: str,
    all_findings: List[Dict[str, Any]],
    current_iteration: int,
    max_iterations: int,
) -> bool:
    """Agent decides whether to continue research or conclude."""

    if current_iteration >= max_iterations:
        return {
            "should_continue": False,
            "reason": f"Reached maximum iterations ({max_iterations})",
        }

    # Analyze findings completeness
    findings_summary = ""
    total_relevance = 0
    for finding in all_findings:
        findings_summary += f"Query: {finding.get('query', 'Unknown')}\n"
        findings_summary += f"Summary: {finding.get('summary', 'No summary')}\n"
        findings_summary += f"Relevance: {finding.get('relevance_score', 5)}/10\n"
        total_relevance += finding.get("relevance_score", 5)

    avg_relevance = total_relevance / len(all_findings) if all_findings else 0

    prompt = f"""
    You are a research agent investigating: {topic}
    
    Current iteration: {current_iteration}/{max_iterations}
    
    Findings so far:
    {findings_summary}
    
    Average relevance score: {avg_relevance:.1f}/10
    
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
    """

    messages = [
        {
            "role": "system",
            "content": "You are a research decision agent. Evaluate research completeness and decide whether to continue. Return JSON.",
        },
        {"role": "user", "content": prompt},
    ]

    response = call_llm(messages)

    try:
        cleaned_response = clean_json_response(response)
        decision = json.loads(cleaned_response)
        return decision.get("should_continue", True)
    except json.JSONDecodeError:
        return True
