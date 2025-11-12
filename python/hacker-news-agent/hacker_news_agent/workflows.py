from datetime import datetime
from typing import Any, Dict

from dbos import DBOS
from rich.console import Console
from rich.panel import Panel

from .agent import (
    evaluate_results_step,
    generate_follow_ups_step,
    should_continue_step,
    synthesize_findings_step,
)
from .api import get_comments_step, search_hackernews_step
from .models import AGENT_STATUS, AgentStatus

console = Console()


@DBOS.workflow()
def agentic_research_workflow(topic: str, max_iterations: int = 3) -> Dict[str, Any]:
    """Main agentic workflow that autonomously researches a topic.

    This demonstrates a complete agentic workflow using DBOS.
    The agent starts with a research topic then:
    1. Searches Hacker News for information on that topic.
    2. Iteratively searches related queries, collecting information.
    3. Makes decisions about when to continue
    4. Synthesizes findings into a final report.

    The entire process is durable and can recover from any failure.
    """

    console.print(f"[dim]🎯 Starting agentic research for: {topic}[/dim]")

    agent_status = AgentStatus(
        agent_id=DBOS.workflow_id,
        created_at=datetime.now().isoformat(),
        topic=topic,
        iterations=0,
        report=None,
        status="PENDING",
    )
    DBOS.set_event(AGENT_STATUS, agent_status)

    all_findings = []
    current_iteration = 0
    current_query = topic

    # Main agentic research loop
    while current_iteration < max_iterations:
        current_iteration += 1
        agent_status.iterations = current_iteration
        DBOS.set_event(AGENT_STATUS, agent_status)

        console.print(
            f"[dim]🔄 Starting iteration {current_iteration}/{max_iterations}[/dim]"
        )

        # Research the next query in a child workflow
        evaluation = research_query(topic, current_query)
        all_findings.append(evaluation)

        # Evaluate whether to continue research
        console.print("[dim]🤔 Agent evaluating whether to continue research...[/dim]")
        should_continue = should_continue_step(
            topic, all_findings, current_iteration, max_iterations
        )
        if not should_continue:
            console.print(f"[dim]✅ Agent decided to conclude research[/dim]")
            break

        # Generate next research question based on findings
        if current_iteration < max_iterations:
            console.print("[dim]💭 Agent generating next research question...[/dim]")
            follow_up_query = generate_follow_ups_step(
                topic, all_findings, current_iteration
            )
            if follow_up_query:
                current_query = follow_up_query
                console.print(f"[dim]➡️  Next research focus: '{current_query}'[/dim]")
            else:
                console.print(
                    "[dim]💡 No new research directions found, concluding...[/dim]"
                )
                break

    # Final step: Synthesize all findings into comprehensive report
    console.print("[dim]📋 Agent synthesizing final research report...[/dim]")
    final_report = synthesize_findings_step(topic, all_findings)
    agent_status.report = final_report
    console.print(f"\n[bold]📊 Research Report:[/bold]")
    console.print(Panel(final_report, border_style="blue", padding=(1, 2)))
    DBOS.set_event(AGENT_STATUS, agent_status)


@DBOS.workflow()
def research_query(topic: str, query: str) -> Dict[str, Any]:
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

    # Step 3: Evaluate gathered data and return findings
    console.print(
        f"[dim]🤔 Analyzing findings from {len(stories)} stories and {len(comments)} comments...[/dim]"
    )
    return evaluate_results_step(topic, query, stories, comments)
