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
def example_workflow():
    step_one()
    step_two()


##################################
#### Queues
##################################

queue = Queue("example-queue")


@DBOS.step()
def queued_step(n: int):
    time.sleep(5)
    DBOS.logger.info(f"Step {n} completed!")


@app.get("/queue")
@DBOS.workflow()
def queue_workflow():
    DBOS.logger.info("Enqueueing steps")
    handles = []
    for i in range(10):
        handle = queue.enqueue(queued_step, i)
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
def transaction_workflow():
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
<body class="bg-gray-100 min-h-screen font-sans">
    <div class="max-w-2xl mx-auto py-12 px-4">
        <div class="bg-white rounded-lg shadow-lg p-8 space-y-8">
            <h1 class="text-3xl font-bold text-gray-900">Welcome to the DBOS Toolbox!</h1>
            
            <p class="text-gray-600">
                This app contains example code for many DBOS features. You can use it as a template when starting a new DBOS app—start by editing <code class="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm">main.py</code>.
            </p>

            <p class="text-gray-600">
                Each endpoint launches a new workflow—<strong>view the app logs to see them run.</strong>
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
            
            <div class="space-y-6">
                <p class="text-gray-800 font-medium">To get started developing locally:</p>
                <ul class="space-y-4">
                    <li class="flex items-start">
                        <span class="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                            <span class="text-blue-600 text-sm font-medium">1</span>
                        </span>
                        <code class="bg-gray-100 px-3 py-1 rounded font-mono text-sm">pip install dbos</code>
                    </li>
                    <li class="flex items-start">
                        <span class="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                            <span class="text-blue-600 text-sm font-medium">2</span>
                        </span>
                        <code class="bg-gray-100 px-3 py-1 rounded font-mono text-sm">dbos init --template dbos-toolbox</code>
                    </li>
                    <li class="flex items-start">
                        <span class="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                            <span class="text-blue-600 text-sm font-medium">3</span>
                        </span>
                        Edit <code class="bg-gray-100 px-3 py-1 rounded font-mono text-sm">main.py</code> to start building!
                    </li>
                </ul>
            </div>

            <p class="text-gray-600">
                Check out the
                <a href="https://docs.dbos.dev/python/programming-guide" target="_blank" class="text-blue-600 hover:text-blue-800 hover:underline">
                    programming guide
                </a>
                to learn how to build with DBOS!
            </p>
        </div>
    </div>
</body>
</html>
    """
