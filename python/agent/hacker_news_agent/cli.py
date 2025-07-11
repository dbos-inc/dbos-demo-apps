import argparse
import json
import os
import sys
from typing import Dict, Any
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
from rich.panel import Panel
from rich.text import Text
from rich.table import Table
from rich.json import JSON

from dbos import DBOS
# Import all modules to ensure decorators are registered
from . import api
from . import llm
from . import agent
from . import workflows
from .workflows import agentic_research_workflow, quick_research_workflow, deep_research_workflow


console = Console()


def display_progress(workflow_handle, research_type: str):
    """Display progress of the research workflow."""
    console.print(f"\n[bold blue]🤖 Starting {research_type} Research Agent[/bold blue]")
    console.print("[dim]The agent will autonomously plan and execute research...[/dim]\n")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TimeElapsedColumn(),
        console=console,
        transient=True
    ) as progress:
        task = progress.add_task("Agent working...", total=None)
        
        # Wait for workflow to complete
        result = workflow_handle.result()
        progress.update(task, description="Research complete!", completed=True)
        
    return result


def format_research_output(result: Dict[str, Any]) -> None:
    """Format and display research results."""
    topic = result.get("topic", "Unknown")
    summary = result.get("summary", {})
    final_report = result.get("final_report", {})
    
    # Header
    console.print(f"\n[bold green]📊 Research Report: {topic}[/bold green]")
    console.print("=" * 60)
    
    # Research Summary
    console.print(f"\n[bold]🔍 Research Summary:[/bold]")
    console.print(f"  • Total Iterations: {result.get('total_iterations', 0)}")
    console.print(f"  • Stories Analyzed: {summary.get('total_stories', 0)}")
    console.print(f"  • Comments Analyzed: {summary.get('total_comments', 0)}")
    console.print(f"  • Average Relevance: {summary.get('avg_relevance', 0):.1f}/10")
    
    # Queries Executed
    queries = summary.get("queries_executed", [])
    if queries:
        console.print(f"\n[bold]🔎 Queries Executed:[/bold]")
        for i, query in enumerate(queries, 1):
            console.print(f"  {i}. {query}")
    
    # Executive Summary
    exec_summary = final_report.get("executive_summary", "")
    if exec_summary:
        console.print(f"\n[bold]📋 Executive Summary:[/bold]")
        console.print(Panel(exec_summary, border_style="blue"))
    
    # Key Findings
    key_findings = final_report.get("key_findings", [])
    if key_findings:
        console.print(f"\n[bold]🎯 Key Findings:[/bold]")
        for finding in key_findings:
            console.print(f"  • {finding}")
    
    # Trends and Patterns
    trends = final_report.get("trends", [])
    if trends:
        console.print(f"\n[bold]📈 Trends & Patterns:[/bold]")
        for trend in trends:
            console.print(f"  • {trend}")
    
    # Important Insights
    insights = final_report.get("insights", [])
    if insights:
        console.print(f"\n[bold]💡 Important Insights:[/bold]")
        for insight in insights:
            console.print(f"  • {insight}")
    
    # Implications
    implications = final_report.get("implications", [])
    if implications:
        console.print(f"\n[bold]🔮 Implications:[/bold]")
        for implication in implications:
            console.print(f"  • {implication}")
    
    # Further Research
    further_research = final_report.get("further_research", [])
    if further_research:
        console.print(f"\n[bold]🔬 Areas for Further Research:[/bold]")
        for area in further_research:
            console.print(f"  • {area}")
    
    console.print("\n" + "=" * 60)
    console.print("[dim]Research completed by DBOS Agentic Research Agent[/dim]")


def format_json_output(result: Dict[str, Any]) -> None:
    """Format and display results as JSON."""
    console.print(JSON.from_data(result))


def display_verbose_output(result: Dict[str, Any]) -> None:
    """Display verbose output showing agent reasoning."""
    console.print(f"\n[bold blue]🤖 Agent Reasoning Process[/bold blue]")
    
    # Research Plan
    research_plan = result.get("research_plan", {})
    if research_plan:
        console.print(f"\n[bold]📋 Initial Research Plan:[/bold]")
        console.print(f"  • Success Criteria: {research_plan.get('success_criteria', 'Not specified')}")
        console.print(f"  • Max Iterations: {research_plan.get('max_iterations', 'Not specified')}")
        
        initial_queries = research_plan.get("initial_queries", [])
        if initial_queries:
            console.print(f"  • Initial Queries: {', '.join(initial_queries)}")
    
    # Research History
    research_history = result.get("research_history", [])
    if research_history:
        console.print(f"\n[bold]🔄 Research Iterations:[/bold]")
        
        for iteration in research_history:
            iter_num = iteration.get("iteration", 0)
            query = iteration.get("query", "Unknown")
            evaluation = iteration.get("evaluation", {})
            
            console.print(f"\n  [bold cyan]Iteration {iter_num}:[/bold cyan] {query}")
            console.print(f"    Stories: {iteration.get('stories_found', 0)}, Comments: {iteration.get('comments_analyzed', 0)}")
            console.print(f"    Relevance: {evaluation.get('relevance_score', 0)}/10")
            
            insights = evaluation.get("insights", [])
            if insights:
                console.print(f"    Key Insights: {', '.join(insights[:2])}")
    
    # Then show the formatted output
    format_research_output(result)


def main():
    parser = argparse.ArgumentParser(description="DBOS Agentic Hacker News Research Agent")
    parser.add_argument("topic", help="Topic to research on Hacker News")
    parser.add_argument("--max-iterations", type=int, default=None, help="Maximum research iterations")
    parser.add_argument("--quick", action="store_true", help="Quick research (2 iterations, no comments)")
    parser.add_argument("--deep", action="store_true", help="Deep research (5 iterations with comments)")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    parser.add_argument("--verbose", action="store_true", help="Show agent reasoning process")
    
    args = parser.parse_args()
    
    # Check for OpenAI API key
    if not os.environ.get("OPENAI_API_KEY"):
        console.print("[bold red]❌ Error: OPENAI_API_KEY environment variable not set[/bold red]")
        console.print("Please set your OpenAI API key:")
        console.print("  export OPENAI_API_KEY='your-api-key-here'")
        return 1
    
    # Initialize DBOS
    try:
        dbos = DBOS(config={
            "name": "hacker-news-agent",
            "database": {
                "hostname": "localhost",
                "port": 5432,
                "username": "postgres",
                "password": "",
                "database": "hacker_news_agent"
            }
        })
        dbos.launch()
    except Exception as e:
        console.print(f"[bold red]❌ Error initializing DBOS: {e}[/bold red]")
        console.print("Note: DBOS requires a PostgreSQL database. Make sure PostgreSQL is running.")
        return 1
    
    try:
        # Choose workflow based on arguments
        if args.quick:
            console.print(f"\n[bold blue]🤖 Starting Quick Research Agent[/bold blue]")
            console.print("[dim]The agent will autonomously plan and execute research...[/dim]\n")
            result = quick_research_workflow(args.topic)
            research_type = "Quick"
        elif args.deep:
            console.print(f"\n[bold blue]🤖 Starting Deep Research Agent[/bold blue]")
            console.print("[dim]The agent will autonomously plan and execute research...[/dim]\n")
            result = deep_research_workflow(args.topic)
            research_type = "Deep"
        else:
            # Default agentic research
            console.print(f"\n[bold blue]🤖 Starting Agentic Research Agent[/bold blue]")
            console.print("[dim]The agent will autonomously plan and execute research...[/dim]\n")
            result = agentic_research_workflow(args.topic, args.max_iterations)
            research_type = "Agentic"
        
        # Display results
        if args.json:
            format_json_output(result)
        elif args.verbose:
            display_verbose_output(result)
        else:
            format_research_output(result)
            
    except KeyboardInterrupt:
        console.print("\n[yellow]Research interrupted by user[/yellow]")
        return 1
    except Exception as e:
        console.print(f"[bold red]❌ Error during research: {e}[/bold red]")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())