"""CLI interface for the DBOS Agentic Hacker News Research Agent.

This demonstrates how to build a user-friendly interface for DBOS agents,
handling initialization, error reporting, and result display.
"""

import argparse
import os
import sys
from typing import Any, Dict

from dbos import DBOS, DBOSConfig
from rich.console import Console
from rich.panel import Panel

# Import workflows to register DBOS decorators
from .workflows import agentic_research_workflow

console = Console()


def format_output(result: Dict[str, Any]) -> None:
    console.print(f"\n[bold blue]🤖 Agent Reasoning Process[/bold blue]")

    # Show how the agent iteratively refined its research
    research_history = result.get("research_history", [])
    if research_history:
        console.print(f"\n[bold]🔄 Research Iterations:[/bold]")

        for iteration in research_history:
            iter_num = iteration.get("iteration", 0)
            query = iteration.get("query", "Unknown")
            evaluation = iteration.get("evaluation", {})

            console.print(f"\n  [bold cyan]Iteration {iter_num}:[/bold cyan] {query}")
            console.print(
                f"    Stories: {iteration.get('stories_found', 0)}, Comments: {iteration.get('comments_analyzed', 0)}"
            )
            console.print(f"    Relevance: {evaluation.get('relevance_score', 0)}/10")

            insights = evaluation.get("insights", [])
            if insights:
                console.print(f"    Key Insights: {', '.join(insights[:2])}")

    # Display final research results
    topic = result.get("topic", "Unknown")
    summary = result.get("summary", {})
    final_report = result.get("final_report", {})

    console.print(f"\n[bold green]📊 Research Report: {topic}[/bold green]")
    console.print("=" * 60)

    # Show research statistics
    console.print(f"\n[bold]🔍 Research Summary:[/bold]")
    console.print(f"  • Total Iterations: {result.get('total_iterations', 0)}")
    console.print(f"  • Stories Analyzed: {summary.get('total_stories', 0)}")
    console.print(f"  • Comments Analyzed: {summary.get('total_comments', 0)}")
    console.print(f"  • Average Relevance: {summary.get('avg_relevance', 0):.1f}/10")

    # Show the agent's research progression
    queries = summary.get("queries_executed", [])
    if queries:
        console.print(f"\n[bold]🔎 Queries Executed:[/bold]")
        for i, query in enumerate(queries, 1):
            console.print(f"  {i}. {query}")

    # Display the agent's synthesized report
    report_text = final_report.get("report", "")
    if report_text:
        console.print(f"\n[bold]📊 Research Report:[/bold]")
        console.print(Panel(report_text, border_style="blue", padding=(1, 2)))

    console.print("\n" + "=" * 60)
    console.print("[dim]Research completed by DBOS Agentic Research Agent[/dim]")


def main():
    parser = argparse.ArgumentParser(
        description="DBOS Agentic Hacker News Research Agent - Learn to build agents with DBOS"
    )
    parser.add_argument("topic", help="Topic to research on Hacker News")
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=8,
        help="Maximum research iterations (default: 8)",
    )

    args = parser.parse_args()

    # Validate required environment variables
    if not os.environ.get("OPENAI_API_KEY"):
        console.print(
            "[bold red]❌ Error: OPENAI_API_KEY environment variable not set[/bold red]"
        )
        console.print("Please set your OpenAI API key:")
        console.print("  export OPENAI_API_KEY='your-api-key-here'")
        sys.exit(1)

    # Initialize DBOS with configuration
    try:
        config: DBOSConfig = {
            "name": "hacker-news-agent",
            "database_url": os.environ.get("DBOS_DATABASE_URL"),
        }
        DBOS(config=config, conductor_key=os.environ.get("CONDUCTOR_KEY"))
        DBOS.launch()
    except Exception as e:
        console.print(f"[bold red]❌ Error initializing DBOS: {e}[/bold red]")
        console.print(
            "Note: DBOS requires a PostgreSQL database. Make sure PostgreSQL is running."
        )
        sys.exit(1)

    try:
        # Launch the agentic research workflow
        console.print(f"\n[bold blue]🤖 Starting Agentic Research Agent[/bold blue]")
        console.print(
            "[dim]The agent will autonomously plan and execute research using DBOS...[/dim]\n"
        )
        
        # Execute the main agentic workflow
        result = agentic_research_workflow(args.topic, args.max_iterations)

        # Display comprehensive results
        format_output(result)

        console.print(f"\n[bold green]✅ Research completed successfully![/bold green]")

    except KeyboardInterrupt:
        console.print("\n[yellow]Research interrupted by user[/yellow]")
        sys.exit(1)
    except Exception as e:
        console.print(f"[bold red]❌ Error during research: {e}[/bold red]")
        sys.exit(1)


if __name__ == "__main__":
    main()