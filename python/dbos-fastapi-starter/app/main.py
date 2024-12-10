import time

from dbos import DBOS
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

# Welcome to DBOS!
# This is a template application built with DBOS and FastAPI.
# It shows you how to build reliable background tasks with DBOS.

app = FastAPI()
DBOS(fastapi=app)

# This endpoint uses DBOS to launch a reliable background task with N steps.


@app.get("/background/{n}")
def launch_background_task(n: int) -> None:
    DBOS.logger.info(f"Starting a background task with {n} steps!")
    DBOS.start_workflow(example_workflow, n)


# This workflow simulates a background task with N steps.

# DBOS workflows are resilient to any failure--if your program is crashed,#
# interrupted, or restarted while running this workflow, the workflow automatically
# resumes from the last completed step.


@DBOS.workflow()
def example_workflow(n: int) -> None:
    for i in range(n):
        do_work(i)


@DBOS.step()
def do_work(i: int):
    time.sleep(1)
    DBOS.logger.info(f"Completed step {i}!")


# This code uses FastAPI to serve an HTML + CSS readme from the root path.


@app.get("/")
def readme() -> HTMLResponse:
    readme = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <title>Welcome to DBOS!</title>
            <link rel="icon" href="https://dbos-blog-posts.s3.us-west-1.amazonaws.com/live-demo/favicon.ico" type="image/x-icon">
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="font-sans text-gray-800 p-6 max-w-2xl mx-auto">
            <h1 class="text-xl font-semibold mb-4">Welcome to DBOS!</h1>
            <p class="mb-4">
                Click <span class="cursor-pointer text-blue-600 hover:underline" onclick="fetch('/background/10', { method: 'GET' })">here</span> to launch a reliable background job.
            </p>
            <p class="mb-4">
                To view the logs for your background job, visit <a href="https://console.dbos.dev/applications/dbos-fastapi-starter" target="_blank" class="text-blue-600 hover:underline">here</a> and click "View Application Logs".
            </p>
            <p class="mb-4">
                To view the status of your background job, click <a href="https://console.dbos.dev/applications/dbos-fastapi-starter/workflows" target="_blank" class="text-blue-600 hover:underline">here</a>.
            </p>
            <p class="mb-4">
                To start building your own crashproof application, edit <code class="bg-gray-100 px-1 rounded">app/main.py</code>, commit your changes, then visit the <a href="https://console.dbos.dev/applications/dbos-fastapi-starter" target="_blank" class="text-blue-600 hover:underline">cloud console</a> to redeploy your app.
            </p>
            <p class="mb-4">
                To learn how to build crashproof apps with DBOS, visit the <a href="https://docs.dbos.dev/python/programming-guide" target="_blank" class="text-blue-600 hover:underline">docs</a>!
            </p>
        </body>
        </html>
        """
    return HTMLResponse(readme)
