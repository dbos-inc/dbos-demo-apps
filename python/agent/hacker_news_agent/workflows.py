from typing import Any, Dict, List, Optional

from dbos import DBOS

from .agent import (evaluate_results_step, generate_follow_ups_step,
                    plan_research_step, should_continue_step)
from .api import get_comments_step, search_hackernews_step
from .llm import synthesize_findings_step


@DBOS.workflow()
def research_iteration_workflow(
    topic: str, query: str, iteration: int, include_comments: bool = True
) -> Dict[str, Any]:
    """Execute a single research iteration."""

    # Search for stories
    stories = search_hackernews_step(query, max_results=30)

    # Optionally get comments for top stories
    comments = []
    if include_comments and stories:
        # Get comments for top 3 stories with decent engagement
        top_stories = [
            story
            for story in stories[:5]
            if story.get("points", 0) > 5 and story.get("num_comments", 0) > 3
        ][:3]

        for story in top_stories:
            story_id = story.get("objectID")
            if story_id:
                story_comments = get_comments_step(story_id, max_comments=20)
                comments.extend(story_comments)

    # Evaluate results
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

    # Step 1: Agent creates research plan
    research_plan = plan_research_step(topic)

    # Use plan's max_iterations or provided value
    if max_iterations is None:
        max_iterations = research_plan.get("max_iterations", 3)

    # Initialize tracking
    all_findings = []
    research_history = []

    # Step 2: Execute initial research queries
    initial_queries = research_plan.get("initial_queries", [topic])

    for i, query in enumerate(initial_queries):
        iteration_result = research_iteration_workflow(
            topic, query, i + 1, include_comments
        )
        research_history.append(iteration_result)
        all_findings.append(iteration_result["evaluation"])

    current_iteration = len(initial_queries)

    # Step 3: Agent-driven research loop
    while current_iteration < max_iterations:
        # Agent decides whether to continue
        decision = should_continue_step(
            topic, all_findings, current_iteration, max_iterations
        )

        if not decision.get("should_continue", False):
            break

        # Agent generates follow-up queries
        follow_up_queries = generate_follow_ups_step(
            topic, all_findings, current_iteration
        )

        if not follow_up_queries:
            break

        # Execute follow-up research
        for query in follow_up_queries[:2]:  # Limit to 2 queries per iteration
            current_iteration += 1
            if current_iteration > max_iterations:
                break

            iteration_result = research_iteration_workflow(
                topic, query, current_iteration, include_comments
            )
            research_history.append(iteration_result)
            all_findings.append(iteration_result["evaluation"])

    # Step 4: Agent synthesizes final report
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
