import json
import os
from typing import Any, Dict, List, Optional

from dbos import DBOS
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables from .env file
load_dotenv()

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


@DBOS.step()
def llm_call_step(
    messages: List[Dict[str, str]],
    model: str = "gpt-4o-mini",
    temperature: float = 0.1,
    max_tokens: int = 2000,
) -> str:
    """Core LLM API call with error handling."""
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


@DBOS.step()
def analyze_content_step(content: str, context: str = "") -> Dict[str, Any]:
    """Analyze content using LLM and return structured insights."""
    prompt = f"""
    Analyze the following content and extract key insights:
    
    Context: {context}
    
    Content to analyze:
    {content}
    
    Provide analysis in JSON format with these fields:
    - "key_topics": List of main topics/themes
    - "sentiment": Overall sentiment (positive/negative/neutral)
    - "important_points": List of most important points
    - "trends": Any trends or patterns identified
    - "relevance_score": Relevance to the research topic (1-10)
    
    Return only valid JSON.
    """

    messages = [
        {
            "role": "system",
            "content": "You are a research analyst. Provide concise, structured analysis in JSON format.",
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

        return json.loads(cleaned_response)
    except json.JSONDecodeError:
        return {
            "key_topics": [],
            "sentiment": "neutral",
            "important_points": [],
            "trends": [],
            "relevance_score": 5,
            "error": "Failed to parse LLM response as JSON",
        }


@DBOS.step()
def generate_queries_step(
    topic: str, previous_findings: List[Dict[str, Any]], iteration: int = 1
) -> List[str]:
    """Generate follow-up search queries based on previous findings."""
    findings_summary = "\n".join(
        [f"- {finding.get('summary', 'No summary')}" for finding in previous_findings]
    )

    prompt = f"""
    You are a research agent investigating: {topic}
    
    This is iteration {iteration} of your research.
    
    Previous findings:
    {findings_summary}
    
    Generate 2-4 SHORT KEYWORD-BASED search queries for Hacker News that would help deepen your research.
    
    IMPORTANT RULES:
    1. Use SHORT keywords or phrases (2-4 words max)
    2. Focus on DIVERSE aspects of the topic, not just one area
    3. Use terms that would actually appear in Hacker News story titles
    4. Avoid long sentences or questions
    5. Think about what developers/tech people would actually discuss
    
    GOOD examples: ["redis performance", "database scaling", "sql optimization"]
    BAD examples: ["How does Redis compare to other databases in terms of performance?"]
    
    Return only a JSON array of SHORT keyword queries: ["query1", "query2", "query3"]
    """

    messages = [
        {
            "role": "system",
            "content": "You are a research agent. Generate focused search queries to deepen research. Return only JSON array.",
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
        return queries if isinstance(queries, list) else [topic]
    except json.JSONDecodeError:
        return [f"{topic} analysis", f"{topic} trends"]


@DBOS.step()
def synthesize_findings_step(
    topic: str, all_findings: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Synthesize all research findings into a comprehensive report."""
    findings_text = ""
    for i, finding in enumerate(all_findings, 1):
        findings_text += f"\n=== Finding {i} ===\n"
        findings_text += f"Query: {finding.get('query', 'Unknown')}\n"
        findings_text += f"Summary: {finding.get('summary', 'No summary')}\n"
        findings_text += f"Key Points: {finding.get('key_points', [])}\n"
        findings_text += f"Insights: {finding.get('insights', 'No insights')}\n"

    prompt = f"""
    You are a research analyst. Synthesize the following research findings into a comprehensive report about: {topic}
    
    Research Findings:
    {findings_text}
    
    IMPORTANT: You must return ONLY a valid JSON object with no additional text, explanations, or formatting.
    
    Return a JSON object with these exact keys:
    {{
        "executive_summary": "2-3 sentence summary of findings",
        "key_findings": ["finding1", "finding2", "finding3"],
        "trends": ["trend1", "trend2"],
        "insights": ["insight1", "insight2"],
        "implications": ["implication1", "implication2"],
        "further_research": ["area1", "area2"]
    }}
    """

    messages = [
        {
            "role": "system",
            "content": "You are a research analyst. Provide comprehensive synthesis in JSON format.",
        },
        {"role": "user", "content": prompt},
    ]

    response = llm_call_step(messages, max_tokens=3000)

    try:
        # Clean the response - remove any markdown formatting
        cleaned_response = response.strip()
        if cleaned_response.startswith("```json"):
            cleaned_response = cleaned_response[7:]
        if cleaned_response.startswith("```"):
            cleaned_response = cleaned_response[3:]
        if cleaned_response.endswith("```"):
            cleaned_response = cleaned_response[:-3]
        cleaned_response = cleaned_response.strip()

        return json.loads(cleaned_response)
    except json.JSONDecodeError as e:
        # Create a basic synthesis from the findings
        basic_insights = []
        for finding in all_findings:
            insights = finding.get("insights", [])
            if insights:
                basic_insights.extend(insights[:2])  # Take first 2 insights

        return {
            "executive_summary": f"Research on {topic} revealed {len(all_findings)} key areas of investigation with varying levels of activity and discussion.",
            "key_findings": (
                basic_insights[:5]
                if basic_insights
                else [f"Limited findings available for {topic}"]
            ),
            "trends": [f"Discussion patterns around {topic}"],
            "insights": basic_insights[:3] if basic_insights else [],
            "implications": [f"Further research needed on {topic}"],
            "further_research": [f"More detailed analysis of {topic} trends"],
            "error": f"JSON parsing failed, created basic synthesis. Error: {str(e)}",
        }
