from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from dbos import DBOS

# Welcome to DBOS!
# This is a template application built with DBOS and FastAPI.

app = FastAPI()
DBOS(fastapi=app)

# This is a simple DBOS workflow with two steps.
# It is served via FastAPI from the /hello endpoint.
# You can use workflows to build crashproof applications.
# Learn more here: https://docs.dbos.dev/python/programming-guide


@DBOS.step()
def hello_step() -> str:
    return "Hello"


@DBOS.step()
def world_step() -> str:
    return "world"


@app.get("/hello")
@DBOS.workflow()
def hello_world() -> str:
    hello = hello_step()
    world = world_step()
    return f"{hello}, {world}!"


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
                This is a template built with DBOS and FastAPI. Visit <code class="bg-gray-100 px-1 rounded"><a href="/hello" target="_blank" class="text-blue-600 hover:underline">/hello</a></code> to see a "Hello, World!" message.
            </p>
            <p class="mb-4">
                To start building, edit <code class="bg-gray-100 px-1 rounded">app/main.py</code>, commit your changes, then visit the <a href="https://console.dbos.dev/applications" target="_blank" class="text-blue-600 hover:underline">cloud console</a> to redeploy your app.
            </p>
            <p class="mb-4">
                To learn how to build crashproof apps with DBOS, visit the <a href="https://docs.dbos.dev/python/programming-guide" target="_blank" class="text-blue-600 hover:underline">docs</a>!
            </p>
        </body>
        </html>
        """
    return HTMLResponse(readme)
