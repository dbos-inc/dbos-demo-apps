import os
import random
from time import sleep
from typing import Optional

from dbos import DBOS, DBOSConfig, Queue
from slack_bolt import App

# Before running this app, set the following environment variables:
# export SLACK_SIGNING_SECRET=***
# export SLACK_BOT_TOKEN=xoxb-***
app = App()

# Create a queue with concurrency of 1 so only one deployment workflow runs at a time
task_queue = Queue(name="deploy-tracker-queue", concurrency=1)


@DBOS.step()
def post_slack_message(message: str, channel: str, thread_ts: Optional[str] = None):
    app.client.chat_postMessage(channel=channel, text=message, thread_ts=thread_ts)


@DBOS.step()
def build_step() -> float:
    duration = random.uniform(5, 20)
    sleep(duration)  # Simulate time taken for the build step
    return duration


@DBOS.step()
def test_step() -> float:
    duration = random.uniform(10, 20)
    sleep(duration)  # Simulate time taken for the test step
    return duration


@DBOS.step()
def deploy_step() -> float:
    duration = random.uniform(5, 15)
    sleep(duration)  # Simulate time taken for the deployment step
    return duration


@DBOS.workflow()
def deploy_tracker_workflow(user_id: str, channel_id: str):
    post_slack_message(
        message=f"Deployment workflow {DBOS.workflow_id} started.", channel=channel_id
    )
    # Use DBOS's built-in event tracking to mark deployment status
    DBOS.set_event("deploy_status", "started")

    # Additional steps for deployment can be added here
    duration = build_step()
    post_slack_message(
        message=f"[Workflow {DBOS.workflow_id}] Step *Build 🚧* completed in {duration:.2f} seconds.",
        channel=channel_id,
    )
    DBOS.set_event("deploy_status", "build_completed")

    duration = test_step()
    post_slack_message(
        message=f"[Workflow {DBOS.workflow_id}] Step *Test 🧪* completed in {duration:.2f} seconds.",
        channel=channel_id,
    )
    DBOS.set_event("deploy_status", "tests_completed")

    duration = deploy_step()
    post_slack_message(
        message=f"[Workflow {DBOS.workflow_id}] Step *Deploy 🚀* completed in {duration:.2f} seconds.",
        channel=channel_id,
    )
    DBOS.set_event("deploy_status", "deployed")

    post_slack_message(
        message=f"Deployment workflow {DBOS.workflow_id} completed successfully. <@{user_id}> :tada:",
        channel=channel_id,
    )


@app.command("/deploy")
def handle_deploy_command(ack, say, command, logger):
    try:
        # Acknowledge the command within 3 seconds, after confirming the workflow has enqueued
        user_id = command["user_id"]
        channel_id = command["channel_id"]
        handle = task_queue.enqueue(deploy_tracker_workflow, user_id, channel_id)
        ack({"response_type": "in_channel"})
        # Check the queue size, and inform the user if there are pending workflows
        queued_workflows = DBOS.list_queued_workflows(
            queue_name="deploy-tracker-queue", load_input=False
        )
        queue_size = len(queued_workflows)
        say(
            f"Deployment workflow has been enqueued by <@{user_id}>, workflow ID {handle.get_workflow_id()}. Currently {queue_size} workflow(s) in the queue."
        )

        # Wait for workflow to complete
        handle.get_result()

    except Exception as e:
        logger.error(f"Error handling slash command: {e}")
        say(f"An error occurred while processing your deployment request: {e}")


@app.command("/check_status")
def handle_check_status_command(ack, body, say, logger):
    try:
        # Acknowledge the command within 3 seconds
        ack({"response_type": "in_channel"})
        workflow_id = body["text"].strip()

        # Check the workflow status and latest deployment status
        handle = DBOS.retrieve_workflow(workflow_id, existing_workflow=False)
        status = handle.get_status().status
        deploy_status = DBOS.get_event(workflow_id, "deploy_status", 10)

        say(
            f"Deployment workflow {workflow_id} is currently *{status}*. Latest deployment status: *{deploy_status}*."
        )

    except Exception as e:
        logger.error(f"Error handling slash command: {e}")
        say(f"An error occurred while processing your check status request: {e}")


if __name__ == "__main__":
    config: DBOSConfig = {
        "name": "deploy-tracker-slackbot",
        "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
        "conductor_key": os.environ.get("DBOS_CONDUCTOR_KEY"),
        "application_version": "0.1.0",
    }
    DBOS(config=config)
    DBOS.launch()
    app.start(port=3000)  # POST http://localhost:3000/slack/events
