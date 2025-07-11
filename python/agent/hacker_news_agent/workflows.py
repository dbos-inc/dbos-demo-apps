"""DBOS workflows orchestrating the agentic research process.

This module demonstrates how to build complex agentic workflows using DBOS.
Each workflow is durable and can recover from failures while maintaining state.
"""

from typing import Any, Dict, Optional

from dbos import DBOS
from rich.console import Console

from .agent import (evaluate_results_step, generate_follow_ups_step,
                    plan_research_step, should_continue_step)
from .api import get_comments_step, search_hackernews_step
from .llm import synthesize_findings_step

console = Console()


@DBOS.workflow()
def research_iteration_workflow(
    topic: str, query: str, iteration: int
) -> Dict[str, Any]:
    """Execute one research iteration as a durable workflow.
    
    This workflow demonstrates how to combine multiple DBOS steps
    into a cohesive research process. If any step fails, DBOS will
    automatically retry from the failed step.
    """

    console.print(f"[dim]🔍 Searching for stories: '{query}'[/dim]")
    
    # Step 1: Search for stories using durable API call
    stories = search_hackernews_step(query, max_results=30)
    
    if stories:
        console.print(f"[dim]📚 Found {len(stories)} stories, analyzing all stories...[/dim]")
        
        # Show what stories the agent is analyzing
        for i, story in enumerate(stories):
            title = story.get("title", "No title")[:80]
            points = story.get("points", 0)
            num_comments = story.get("num_comments", 0)
            console.print(f"[dim]  📖 Story {i+1}: {title}... ({points} points, {num_comments} comments)[/dim]")
    else:
        console.print("[dim]❌ No stories found for this query[/dim]")

    # Step 2: Gather comments from all stories for deeper analysis
    comments = []
    if stories:
        console.print(f"[dim]💬 Reading comments from ALL {len(stories)} stories...[/dim]")
        
        for i, story in enumerate(stories):
            story_id = story.get("objectID")
            title = story.get("title", "Unknown")[:50]
            num_comments = story.get("num_comments", 0)
            
            if story_id and num_comments > 0:
                console.print(f"[dim]  💭 Reading comments from: {title}... ({num_comments} comments)[/dim]")
                # Each comment fetch is a durable step
                story_comments = get_comments_step(story_id, max_comments=10)
                comments.extend(story_comments)
                console.print(f"[dim]    ✓ Read {len(story_comments)} comments[/dim]")
            elif story_id:
                console.print(f"[dim]  📖 Story has no comments: {title}[/dim]")
            else:
                console.print(f"[dim]  ❌ No story ID available for: {title}[/dim]")

    # Step 3: Agent evaluates and extracts insights from gathered data
    console.print(f"[dim]🤔 Analyzing findings from {len(stories)} stories and {len(comments)} comments...[/dim]")
    evaluation = evaluate_results_step(topic, query, stories, comments)

    return {
        "iteration": iteration,
        "query": query,
        "stories_found": len(stories),
        "comments_analyzed": len(comments),
        "evaluation": evaluation,
        "stories": stories,
        "comments": comments,
    }


@DBOS.workflow()
def agentic_research_workflow(
    topic: str, max_iterations: Optional[int] = None
) -> Dict[str, Any]:
    """Main agentic workflow that autonomously researches a topic.
    
    This demonstrates a complete agentic workflow using DBOS:
    1. Agent plans its research approach
    2. Agent iteratively searches and analyzes
    3. Agent makes decisions about when to continue
    4. Agent synthesizes final findings
    
    The entire process is durable and can recover from any failure.
    """

    # Step 1: Agent creates initial research plan
    console.print(f"[dim]🎯 Agent planning research approach for: {topic}[/dim]")
    research_plan = plan_research_step(topic)

    # Initialize agent state
    if max_iterations is None:
        max_iterations = 8
    
    all_findings = []
    research_history = []
    current_iteration = 0
    current_query = topic
    
    # Main agentic research loop - each iteration is a durable workflow
    while current_iteration < max_iterations:
        current_iteration += 1
        
        console.print(f"[dim]🔄 Starting iteration {current_iteration}/{max_iterations}[/dim]")
        
        # Execute one research iteration as a durable workflow
        iteration_result = research_iteration_workflow(
            topic, current_query, current_iteration
        )
        research_history.append(iteration_result)
        all_findings.append(iteration_result["evaluation"])
        
        # Agent adaptation: Handle cases where no results are found
        stories_found = iteration_result["stories_found"]
        
        if stories_found == 0:
            console.print(f"[dim]⚠️  No stories found for '{current_query}', trying alternative approach...[/dim]")
            
            # Agent generates alternative queries when hitting dead ends
            alternative_queries = generate_follow_ups_step(
                topic, all_findings, current_iteration
            )
            
            if alternative_queries:
                current_query = alternative_queries[0]
                console.print(f"[dim]🔄 Retrying with: '{current_query}'[/dim]")
                continue
            else:
                console.print("[dim]❌ No alternative queries available, continuing...[/dim]")
        
        # Agent decision-making: Evaluate whether to continue research
        if current_iteration >= 2:
            console.print("[dim]🤔 Agent evaluating whether to continue research...[/dim]")
            decision = should_continue_step(
                topic, all_findings, current_iteration, max_iterations
            )

            if not decision.get("should_continue", False):
                console.print(f"[dim]✅ Agent decided to conclude research: {decision.get('reason', 'No reason provided')}[/dim]")
                break

        # Agent planning: Generate next research question based on findings
        if current_iteration < max_iterations:
            console.print("[dim]💭 Agent generating next research question...[/dim]")
            follow_up_queries = generate_follow_ups_step(
                topic, all_findings, current_iteration
            )

            if follow_up_queries:
                current_query = follow_up_queries[0]  # Take the first suggestion
                console.print(f"[dim]➡️  Next research focus: '{current_query}'[/dim]")
            else:
                console.print("[dim]💡 No new research directions found, concluding...[/dim]")
                break

    # Final step: Agent synthesizes all findings into comprehensive report
    console.print("[dim]📋 Agent synthesizing final research report...[/dim]")
    final_report = synthesize_findings_step(topic, all_findings)

    # Return complete research results
    return {
        "topic": topic,
        "research_plan": research_plan,
        "total_iterations": current_iteration,
        "max_iterations": max_iterations,
        "research_history": research_history,
        "final_report": final_report,
        "summary": {
            "total_stories": sum(r["stories_found"] for r in research_history),
            "total_comments": sum(r["comments_analyzed"] for r in research_history),
            "queries_executed": [r["query"] for r in research_history],
            "avg_relevance": (
                sum(f.get("relevance_score", 0) for f in all_findings)
                / len(all_findings)
                if all_findings
                else 0
            ),
        },
    }
