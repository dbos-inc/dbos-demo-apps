import os

import uvicorn
from dbos import DBOSClient, EnqueueOptions
from fastapi import FastAPI

app = FastAPI()

system_database_url = os.environ.get(
    "DBOS_SYSTEM_DATABASE_URL", "sqlite:///dbos_queue_worker.sqlite"
)
client = DBOSClient(system_database_url=system_database_url)


@app.get("/api/workflow")
def enqueue_workflow():
    options: EnqueueOptions = {
        "queue_name": "workflow-queue",
        "workflow_name": "workflow",
    }
    num_tasks = 10
    client.enqueue(options, num_tasks)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
