import os
import threading

from dbos import DBOS, DBOSConfig, Queue

Queue("workflow-queue")


@DBOS.step()
def step(i: int):
    print(f"Step {i} completed!")


@DBOS.workflow()
def workflow(num_steps: int):
    for i in range(num_steps):
        step(i)


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
