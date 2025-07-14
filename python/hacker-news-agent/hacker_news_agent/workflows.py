"""DBOS workflows orchestrating the agentic research process.

This module demonstrates how to build complex agentic workflows using DBOS.
Each workflow is durable and can recover from failures while maintaining state.
"""

from typing import Any, Dict, Optional

from dbos import DBOS
from rich.console import Console

from .agent import (evaluate_results_step, generate_follow_ups_step,
                    should_continue_step)
from .api import get_comments_step, search_hackernews_step
from .llm import synthesize_findings_step

console = Console()


@DBOS.workflow()
def agentic_research_workflow(topic: str, max_iterations: int) -> Dict[str, Any]:
    """Main agentic workflow that autonomously researches a topic.

    This demonstrates a complete agentic workflow using DBOS.
    The agent starts with a research topic then:
    1. Searches Hacker News for information on that topic.
    2. Iteratively searches related topics, collecting information.
    3. Makes decisions about when to continue
    4. Synthesizes findings into a final report.

    The entire process is durable and can recover from any failure.
    """

    console.print(f"[dim]🎯 Starting agentic research for: {topic}[/dim]")

    all_findings = []
    research_history = []
    current_iteration = 0
    current_query = topic

    # Main agentic research loop
    while current_iteration < max_iterations:
        current_iteration += 1

        console.print(
            f"[dim]🔄 Starting iteration {current_iteration}/{max_iterations}[/dim]"
        )

        # Research the next query in a child workflow
        iteration_result = research_query(topic, current_query, current_iteration)
        research_history.append(iteration_result)
        all_findings.append(iteration_result["evaluation"])

        # Handle cases where no results are found
        stories_found = iteration_result["stories_found"]

        if stories_found == 0:
            console.print(
                f"[dim]⚠️  No stories found for '{current_query}', trying alternative approach...[/dim]"
            )

            # Generate alternative queries when hitting dead ends
            alternative_queries = generate_follow_ups_step(
                topic, all_findings, current_iteration
            )

            if alternative_queries:
                current_query = alternative_queries[0]
                console.print(f"[dim]🔄 Retrying with: '{current_query}'[/dim]")
                continue
            else:
                console.print(
                    "[dim]❌ No alternative queries available, continuing...[/dim]"
                )

        # Evaluate whether to continue research
        console.print("[dim]🤔 Agent evaluating whether to continue research...[/dim]")
        decision = should_continue_step(
            topic, all_findings, current_iteration, max_iterations
        )

        if not decision.get("should_continue", False):
            console.print(
                f"[dim]✅ Agent decided to conclude research: {decision.get('reason', 'No reason provided')}[/dim]"
            )
            break

        # Generate next research question based on findings
        if current_iteration < max_iterations:
            console.print("[dim]💭 Agent generating next research question...[/dim]")
            follow_up_queries = generate_follow_ups_step(
                topic, all_findings, current_iteration
            )

            if follow_up_queries:
                current_query = follow_up_queries[0]
                console.print(f"[dim]➡️  Next research focus: '{current_query}'[/dim]")
            else:
                console.print(
                    "[dim]💡 No new research directions found, concluding...[/dim]"
                )
                break

    # Final step: Synthesize all findings into comprehensive report
    console.print("[dim]📋 Agent synthesizing final research report...[/dim]")
    final_report = synthesize_findings_step(topic, all_findings)

    # Return complete research results
    return {
        "topic": topic,
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


@DBOS.workflow()
def research_query(topic: str, query: str, iteration: int) -> Dict[str, Any]:
    """Research a query selected by the main agentic workflow."""

    console.print(f"[dim]🔍 Searching for stories: '{query}'[/dim]")

    # Step 1: Search Hacker News for stories about the topic
    stories = search_hackernews_step(query, max_results=30)

    if stories:
        console.print(
            f"[dim]📚 Found {len(stories)} stories, analyzing all stories...[/dim]"
        )
        for i, story in enumerate(stories):
            title = story.get("title", "No title")[:80]
            points = story.get("points", 0)
            num_comments = story.get("num_comments", 0)
            console.print(
                f"[dim]  📖 Story {i+1}: {title}... ({points} points, {num_comments} comments)[/dim]"
            )
    else:
        console.print("[dim]❌ No stories found for this query[/dim]")

    # Step 2: Gather comments from all stories found
    comments = []
    if stories:
        console.print(
            f"[dim]💬 Reading comments from ALL {len(stories)} stories...[/dim]"
        )

        for i, story in enumerate(stories):
            story_id = story.get("objectID")
            title = story.get("title", "Unknown")[:50]
            num_comments = story.get("num_comments", 0)

            if story_id and num_comments > 0:
                console.print(
                    f"[dim]  💭 Reading comments from: {title}... ({num_comments} comments)[/dim]"
                )
                story_comments = get_comments_step(story_id, max_comments=10)
                comments.extend(story_comments)
                console.print(f"[dim]    ✓ Read {len(story_comments)} comments[/dim]")
            elif story_id:
                console.print(f"[dim]  📖 Story has no comments: {title}[/dim]")
            else:
                console.print(f"[dim]  ❌ No story ID available for: {title}[/dim]")

    # Step 3: Evaluates gathered data and returns findings
    console.print(
        f"[dim]🤔 Analyzing findings from {len(stories)} stories and {len(comments)} comments...[/dim]"
    )
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
