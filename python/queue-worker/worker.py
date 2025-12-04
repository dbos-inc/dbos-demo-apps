import os
import threading
import time

from dbos import DBOS, DBOSConfig, Queue

Queue("workflow-queue")


@DBOS.step()
def step(i: int):
    print(f"Step {i} completed!")
    time.sleep(1)


WF_PROGRESS_KEY = "workflow_progress"


@DBOS.workflow()
def workflow(num_steps: int):
    progress = {
        "steps_completed": 0,
        "num_steps": num_steps,
    }
    DBOS.set_event(WF_PROGRESS_KEY, progress)
    for i in range(num_steps):
        step(i)
        progress["steps_completed"] = i + 1
        DBOS.set_event(WF_PROGRESS_KEY, progress)


if __name__ == "__main__":
    system_database_url = os.environ.get(
        "DBOS_SYSTEM_DATABASE_URL", "sqlite:///dbos_queue_worker.sqlite"
    )
    config: DBOSConfig = {
        "name": "dbos-queue-worker",
        "system_database_url": system_database_url,
    }
    DBOS(config=config)
    DBOS.launch()
    threading.Event().wait()
