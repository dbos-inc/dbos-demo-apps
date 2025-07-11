import json
from typing import Any, Dict, List, Optional

from dbos import DBOS

from .llm import llm_call_step


@DBOS.step()
def plan_research_step(topic: str) -> Dict[str, Any]:
    """Agent creates an initial research plan for the topic."""
    prompt = f"""
    You are a research agent tasked with investigating: {topic}
    
    Create a research plan that identifies:
    1. Key aspects to investigate about this topic
    2. Success criteria for comprehensive research
    3. Research approach and methodology
    
    Return JSON with these fields:
    - "key_aspects": Array of important aspects to investigate
    - "success_criteria": What would make this research complete
    - "research_approach": Brief description of how to approach this topic
    - "max_iterations": Recommended number of research iterations (3-6)
    
    Example format:
    {{
        "key_aspects": ["aspect1", "aspect2", "aspect3"],
        "success_criteria": "Understanding of X, Y, and Z",
        "research_approach": "Start broad then drill down into specific areas",
        "max_iterations": 4
    }}
    """

    messages = [
        {
            "role": "system",
            "content": "You are a research planning agent. Create focused research plans in JSON format.",
        },
        {"role": "user", "content": prompt},
    ]

    response = llm_call_step(messages)

    try:
        # Clean the response
        cleaned_response = response.strip()
        if cleaned_response.startswith("```json"):
            cleaned_response = cleaned_response[7:]
        if cleaned_response.startswith("```"):
            cleaned_response = cleaned_response[3:]
        if cleaned_response.endswith("```"):
            cleaned_response = cleaned_response[:-3]
        cleaned_response = cleaned_response.strip()

        plan = json.loads(cleaned_response)
        # Ensure required fields exist
        if "key_aspects" not in plan:
            plan["key_aspects"] = ["general analysis"]
        if "max_iterations" not in plan:
            plan["max_iterations"] = 4
        return plan
    except json.JSONDecodeError:
        return {
            "key_aspects": ["general analysis"],
            "success_criteria": f"Basic understanding of {topic}",
            "research_approach": "Iterative exploration of the topic",
            "max_iterations": 4,
        }


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

    # Create content digest for LLM
    stories_text = ""
    for story in stories[:10]:  # Limit to top 10 stories
        stories_text += f"Title: {story.get('title', 'No title')}\n"
        stories_text += f"Points: {story.get('points', 0)}, Comments: {story.get('num_comments', 0)}\n"
        stories_text += f"URL: {story.get('url', 'No URL')}\n"
        stories_text += f"Author: {story.get('author', 'Unknown')}\n\n"

    comments_text = ""
    if comments:
        for comment in comments[:20]:  # Limit to top 20 comments
            comment_text = comment.get("comment_text", "")
            if comment_text:
                comments_text += f"Comment: {comment_text[:200]}...\n"
                comments_text += f"Author: {comment.get('author', 'Unknown')}\n\n"

    prompt = f"""
    You are a research agent evaluating search results for: {topic}
    
    Query used: {query}
    
    Stories found:
    {stories_text}
    
    Comments analyzed:
    {comments_text}
    
    Evaluate these results and provide:
    1. Key insights discovered
    2. Relevance to the research topic (1-10)
    3. What important questions remain unanswered
    4. Suggested follow-up research directions
    
    Return JSON with:
    - "insights": Array of key insights
    - "relevance_score": Number 1-10
    - "unanswered_questions": Array of questions needing more research
    - "follow_up_suggestions": Array of specific research directions
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

    response = llm_call_step(messages, max_tokens=2000)

    try:
        # Clean the response
        cleaned_response = response.strip()
        if cleaned_response.startswith("```json"):
            cleaned_response = cleaned_response[7:]
        if cleaned_response.startswith("```"):
            cleaned_response = cleaned_response[3:]
        if cleaned_response.endswith("```"):
            cleaned_response = cleaned_response[:-3]
        cleaned_response = cleaned_response.strip()

        evaluation = json.loads(cleaned_response)
        # Add metadata
        evaluation["query"] = query
        evaluation["stories_count"] = len(stories)
        evaluation["comments_count"] = len(comments) if comments else 0
        return evaluation
    except json.JSONDecodeError:
        return {
            "insights": [f"Found {len(stories)} stories about {topic}"],
            "relevance_score": 7,
            "unanswered_questions": [],
            "follow_up_suggestions": [],
            "summary": f"Basic search results for {query}",
            "key_points": [],
            "query": query,
            "stories_count": len(stories),
            "comments_count": len(comments) if comments else 0,
        }


@DBOS.step()
def generate_follow_ups_step(
    topic: str, current_findings: List[Dict[str, Any]], iteration: int
) -> List[str]:
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

    response = llm_call_step(messages)

    try:
        # Clean the response
        cleaned_response = response.strip()
        if cleaned_response.startswith("```json"):
            cleaned_response = cleaned_response[7:]
        if cleaned_response.startswith("```"):
            cleaned_response = cleaned_response[3:]
        if cleaned_response.endswith("```"):
            cleaned_response = cleaned_response[:-3]
        cleaned_response = cleaned_response.strip()

        queries = json.loads(cleaned_response)
        return queries if isinstance(queries, list) else []
    except json.JSONDecodeError:
        return []


@DBOS.step()
def should_continue_step(
    topic: str,
    all_findings: List[Dict[str, Any]],
    current_iteration: int,
    max_iterations: int,
) -> Dict[str, Any]:
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
    
    Decide whether to continue research or conclude. Consider:
    1. Are the key aspects of the topic well covered?
    2. Are there significant gaps in understanding?
    3. Would additional research add meaningful value?
    4. Is the current information sufficient for a comprehensive report?
    
    Return JSON with:
    - "should_continue": boolean
    - "reason": string explaining the decision
    - "confidence": number 1-10 in the decision
    """

    messages = [
        {
            "role": "system",
            "content": "You are a research decision agent. Evaluate research completeness and decide whether to continue. Return JSON.",
        },
        {"role": "user", "content": prompt},
    ]

    response = llm_call_step(messages)

    try:
        # Clean the response
        cleaned_response = response.strip()
        if cleaned_response.startswith("```json"):
            cleaned_response = cleaned_response[7:]
        if cleaned_response.startswith("```"):
            cleaned_response = cleaned_response[3:]
        if cleaned_response.endswith("```"):
            cleaned_response = cleaned_response[:-3]
        cleaned_response = cleaned_response.strip()

        decision = json.loads(cleaned_response)
        return decision
    except json.JSONDecodeError:
        return {
            "should_continue": current_iteration < max_iterations and avg_relevance < 8,
            "reason": "Default decision based on iteration count and relevance",
            "confidence": 5,
        }
