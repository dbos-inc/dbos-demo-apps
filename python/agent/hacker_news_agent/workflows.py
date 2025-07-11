from typing import Any, Dict, List, Optional

from dbos import DBOS

from .agent import (evaluate_results_step, generate_follow_ups_step,
                    plan_research_step, should_continue_step)
from .api import get_comments_step, search_hackernews_step
from .llm import synthesize_findings_step


@DBOS.step()
def log_research_step(message: str) -> None:
    """Log research progress messages."""
    from rich.console import Console
    console = Console()
    console.print(f"[dim]{message}[/dim]")


@DBOS.workflow()
def research_iteration_workflow(
    topic: str, query: str, iteration: int, include_comments: bool = True
) -> Dict[str, Any]:
    """Execute a single research iteration."""

    log_research_step(f"🔍 Searching for stories: '{query}'")
    
    # Search for stories
    stories = search_hackernews_step(query, max_results=30)
    
    if stories:
        log_research_step(f"📚 Found {len(stories)} stories, analyzing diverse selection...")
        
        # Log interesting stories we're analyzing - show variety, not just top ones
        for i, story in enumerate(stories[:8]):  # Show more stories
            title = story.get("title", "No title")[:60]
            points = story.get("points", 0)
            num_comments = story.get("num_comments", 0)
            log_research_step(f"  📖 Story {i+1}: {title}... ({points} points, {num_comments} comments)")
    else:
        log_research_step("❌ No stories found for this query")

    # Optionally get comments for diverse stories
    comments = []
    if include_comments and stories:
        # Get comments from diverse stories (mix of high and medium engagement)
        # Take top 2 stories and 2 from middle range for diversity
        high_engagement = [
            story for story in stories[:3] 
            if story.get("points", 0) > 5 and story.get("num_comments", 0) > 3
        ][:2]
        
        medium_engagement = [
            story for story in stories[3:10] 
            if story.get("points", 0) > 0 and story.get("num_comments", 0) > 1
        ][:2]
        
        selected_stories = high_engagement + medium_engagement

        if selected_stories:
            log_research_step(f"💬 Reading comments from {len(selected_stories)} diverse stories...")
            
            for i, story in enumerate(selected_stories):
                story_id = story.get("objectID")
                title = story.get("title", "Unknown")[:40]
                if story_id:
                    log_research_step(f"  💭 Reading comments from: {title}...")
                    story_comments = get_comments_step(story_id, max_comments=15)
                    comments.extend(story_comments)
                    log_research_step(f"    ✓ Read {len(story_comments)} comments")

    # Evaluate results
    log_research_step(f"🤔 Analyzing findings from {len(stories)} stories and {len(comments)} comments...")
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
    topic: str, max_iterations: Optional[int] = None, include_comments: bool = True
) -> Dict[str, Any]:
    """Main agentic research workflow that autonomously researches a topic."""

    # Step 1: Agent creates initial research plan (just for context, not all queries)
    log_research_step(f"🎯 Agent planning research approach for: {topic}")
    research_plan = plan_research_step(topic)

    # Use provided max_iterations or default to 8
    if max_iterations is None:
        max_iterations = 8

    # Initialize tracking
    all_findings = []
    research_history = []
    current_iteration = 0

    # Step 2: Start with the original topic as first query
    current_query = topic
    
    # Main iterative research loop
    while current_iteration < max_iterations:
        current_iteration += 1
        
        log_research_step(f"🔄 Starting iteration {current_iteration}/{max_iterations}")
        
        # Execute research iteration
        iteration_result = research_iteration_workflow(
            topic, current_query, current_iteration, include_comments
        )
        research_history.append(iteration_result)
        all_findings.append(iteration_result["evaluation"])
        
        # Check if we found anything useful
        stories_found = iteration_result["stories_found"]
        relevance_score = iteration_result["evaluation"].get("relevance_score", 0)
        
        if stories_found == 0:
            log_research_step(f"⚠️  No stories found for '{current_query}', trying alternative approach...")
            
            # Generate alternative queries when we find nothing
            alternative_queries = generate_follow_ups_step(
                topic, all_findings, current_iteration
            )
            
            if alternative_queries:
                # Try the first alternative
                current_query = alternative_queries[0]
                log_research_step(f"🔄 Retrying with: '{current_query}'")
                continue
            else:
                log_research_step("❌ No alternative queries available, continuing...")
        
        # If we have enough iterations, check if we should continue
        if current_iteration >= 2:
            log_research_step("🤔 Agent evaluating whether to continue research...")
            decision = should_continue_step(
                topic, all_findings, current_iteration, max_iterations
            )

            if not decision.get("should_continue", False):
                log_research_step(f"✅ Agent decided to conclude research: {decision.get('reason', 'No reason provided')}")
                break

        # Generate next research question based on current findings
        if current_iteration < max_iterations:
            log_research_step("💭 Agent generating next research question...")
            follow_up_queries = generate_follow_ups_step(
                topic, all_findings, current_iteration
            )

            if follow_up_queries:
                current_query = follow_up_queries[0]  # Take the first suggestion
                log_research_step(f"➡️  Next research focus: '{current_query}'")
            else:
                log_research_step("💡 No new research directions found, concluding...")
                break

    # Step 3: Agent synthesizes final report
    log_research_step("📋 Agent synthesizing final research report...")
    final_report = synthesize_findings_step(topic, all_findings)

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
