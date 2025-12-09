import json
import os
import threading
import time
from typing import Any

from dbos import DBOS, DBOSConfig, Queue, Serializer

# Define constants and models
WF_PROGRESS_KEY = "workflow_progress"


# Define a queue on which the web server
# can submit workflows for execution.
Queue("workflow-queue")


# This background workflow is submitted by the
# web server. It runs a number of steps,
# periodically reporting its progress.
@DBOS.workflow()
def workflow(num_steps: int):
    progress = {
        "steps_completed": 0,
        "num_steps": num_steps,
    }
    # The server can query this event to obtain
    # the current progress of the workflow
    DBOS.set_event(WF_PROGRESS_KEY, progress)
    for i in range(num_steps):
        step(i)
        # Update workflow progress each time a step completes
        progress["steps_completed"] = i + 1
        DBOS.set_event(WF_PROGRESS_KEY, progress)


@DBOS.step()
def step(i: int):
    print(f"Step {i} completed!")
    time.sleep(1)



class JsonSerializer(Serializer):
    def serialize(self, data: Any) -> str:
        return json.dumps(data)

    def deserialize(cls, serialized_data: str) -> Any:
        return json.loads(serialized_data)

# Configure and launch DBOS
if __name__ == "__main__":
    system_database_url = os.environ.get(
        "DBOS_SYSTEM_DATABASE_URL", 'postgresql://postgres:dbos@localhost:5432/dbos_queue_worker'
    )
    config: DBOSConfig = {
        "name": "dbos-queue-worker",
        "system_database_url": system_database_url,
        "serializer": JsonSerializer(),
    }
    DBOS(config=config)
    DBOS.launch()
    # After launching DBOS, the worker waits indefinitely,
    # dequeuing and executing workflows.
    threading.Event().wait()
