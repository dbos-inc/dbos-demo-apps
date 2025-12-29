# Copilot Instructions for Deploy Tracker Slackbot

## Project Overview
- This is a Slack bot that manages app deployments and tracks pipeline progress via Slack commands.
- Core logic is in [main.py](../../main.py). The bot listens for `/deploy` and `/check_status` commands in Slack.
- Uses the [DBOS](https://pypi.org/project/dbos/) workflow engine for orchestration and event tracking, and [slack-bolt](https://slack.dev/bolt-python/) for Slack integration.

## Architecture & Data Flow
- **Slack Commands**: `/deploy` triggers a deployment workflow; `/check_status` queries workflow status.
- **Workflow Queue**: Only one deployment runs at a time (see `Queue(name="deploy-tracker-queue", concurrency=1)`).
- **Workflow Steps**: Each deployment step (build, test, deploy) is a `@DBOS.step()`; status is posted to Slack and tracked via DBOS events.
- **Event Tracking**: Deployment status is set with `DBOS.set_event()` and retrieved with `DBOS.get_event()`.
- **Error Handling**: Random failures are simulated in `deploy_step` for demo purposes.

## Developer Workflows
- **Run Locally**:
  1. Set environment variables: `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `DBOS_SYSTEM_DATABASE_URL`, `DBOS_CONDUCTOR_KEY`.
  2. Start the bot: `python main.py` (runs on port 3000).
- **Formatting**: Use `black` and `isort` (see `[dependency-groups]` in pyproject.toml).
- **Dependencies**: Managed via `pyproject.toml`.

## Project Conventions
- All workflow steps and workflows are decorated with `@DBOS.step()` and `@DBOS.workflow()`.
- Slack messages are posted using the `post_slack_message` step for consistency.
- Only one deployment workflow is allowed at a time (enforced by the queue).
- Status and results are always communicated back to Slack users.

## Integration Points
- **Slack**: All user interaction is via Slack commands.
- **DBOS**: Used for workflow orchestration, event tracking, and queue management.

## Key Files
- [main.py](../../main.py): All logic for Slack command handling, workflow orchestration, and deployment steps.
- [pyproject.toml](../../pyproject.toml): Dependency and dev tool configuration.
- [README.md](../../README.md): High-level project description.

## Example Patterns
- To add a new deployment step, define a new `@DBOS.step()` and call it from `deploy_tracker_workflow`.
- To add a new Slack command, use `@app.command("/your_command")` and implement the handler.

---
For more, see code comments in [main.py](../../main.py).
