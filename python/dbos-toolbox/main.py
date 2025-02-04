import time

from dbos import DBOS, Queue
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from schema import example_table

app = FastAPI()
DBOS(fastapi=app)

##################################
#### Workflows and Steps
##################################


@DBOS.step()
def step_one():
    DBOS.logger.info("Step one completed!")


@DBOS.step()
def step_two():
    DBOS.logger.info("Step two completed!")


@app.get("/workflow")
@DBOS.workflow()
def dbos_workflow():
    step_one()
    step_two()


##################################
#### Queues
##################################

queue = Queue("example-queue")


@DBOS.step()
def dbos_step(n: int):
    time.sleep(5)
    DBOS.logger.info(f"Step {n} completed!")


@app.get("/queue")
@DBOS.workflow()
def dbos_workflow():
    DBOS.logger.info("Enqueueing steps")
    handles = []
    for i in range(10):
        handle = queue.enqueue(dbos_step, i)
        handles.append(handle)
    results = [handle.get_result() for handle in handles]
    DBOS.logger.info(f"Successfully completed {len(results)} steps")


##################################
#### Scheduled Workflows
##################################


@DBOS.scheduled("* * * * *")
@DBOS.workflow()
def run_every_minute(scheduled_time, actual_time):
    DBOS.logger.info(f"I am a scheduled workflow. It is currently {scheduled_time}.")


##################################
#### Transactions
##################################


@DBOS.transaction()
def insert_row():
    DBOS.sql_session.execute(example_table.insert().values(name="dbos"))


@DBOS.transaction()
def count_rows():
    count = DBOS.sql_session.execute(example_table.select()).rowcount
    DBOS.logger.info(f"Row count: {count}")


@app.get("/transaction")
@DBOS.workflow()
def dbos_workflow():
    insert_row()
    count_rows()


##################################
#### README
##################################


@app.get("/", response_class=HTMLResponse)
async def read_root():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" href="https://dbos-blog-posts.s3.us-west-1.amazonaws.com/live-demo/favicon.ico" type="image/x-icon">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>DBOS Toolbox</title>
    </head>
    <body class="bg-gray-100 min-h-screen">
    <div class="max-w-2xl mx-auto py-8 px-4">
    <div class="bg-white rounded-lg shadow-lg p-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-6">Welcome to the DBOS Toolbox!</h1>
        
        <p class="text-gray-600 mb-6">
            This app contains example code for many DBOS features. You can use it as a template when starting a new DBOS app—start by editing <code class="bg-gray-100 px-1 rounded">main.py</code>.
        </p>
        
        <p class="text-gray-600 mb-6">
            To learn more, check out the
            <a href="https://docs.dbos.dev/python/programming-guide" class="text-blue-600 hover:text-blue-800 hover:underline">
                DBOS programming guide
            </a>
        </p>

        <p class="text-gray-600 mb-8">
            Each endpoint launches a different workflow—check the logs to see them run.
        </p>

        <div class="space-y-4">
            <div class="text-gray-600">
                Workflows: <button onclick="fetch('/workflow')" class="text-blue-600 hover:text-blue-800 font-medium">/workflow</button>
            </div>
            <div class="text-gray-600">
                Queues: <button onclick="fetch('/queue')" class="text-blue-600 hover:text-blue-800 font-medium">/queue</button>
            </div>
            <div class="text-gray-600">
                Transactions: <button onclick="fetch('/transaction')" class="text-blue-600 hover:text-blue-800 font-medium">/transaction</button>
            </div>
        </div>
    </div>
    </div>
    </body>
    </html>
    """
