# Welcome to DBOS!

# This is a sample app built with DBOS, FastAPI, and SQLAlchemy ORM.
# It displays greetings to visitors and keeps track of how
# many times visitors have been greeted.

# First, let's do imports, create a FastAPI app, and initialize DBOS.

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from sqlalchemy import select

from dbos import DBOS

from .schema import Hello

app = FastAPI()
DBOS(fastapi=app)

# Next, let's write a function that greets visitors.
# To make it more interesting, we'll keep track of how
# many times visitors have been greeted and store
# the count in the database.

# We implement the database operations using SQLAlchemy
# and serve the function from a FastAPI endpoint.
# We annotate it with @DBOS.transaction() to access
# an automatically-configured database client.


@app.get("/greeting/{name}")
@DBOS.transaction()
def example_transaction(name: str) -> str:
    new_greeting = Hello(name=name)
    DBOS.sql_session.add(new_greeting)
    stmt = select(Hello).where(Hello.name == name).order_by(Hello.greet_count.desc()).limit(1)
    row = DBOS.sql_session.scalar(stmt)
    greet_count = row.greet_count
    # Below is the deprecated way to query the database.
    # row = DBOS.sql_session.query(Hello).filter(Hello.name == name).order_by(Hello.greet_count.desc()).first()
    # greet_count = row.greet_count
    greeting = f"Greetings, {name}! You have been greeted {greet_count} times."
    DBOS.logger.info(greeting)
    return greeting


# Finally, let's use FastAPI to serve an HTML + CSS readme
# from the root path.


@app.get("/")
def readme() -> HTMLResponse:
    readme = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <title>Welcome to DBOS!</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="font-sans text-gray-800 p-6 max-w-2xl mx-auto">
            <h1 class="text-xl font-semibold mb-4">Welcome to DBOS!</h1>
            <p class="mb-4">
                Visit the route <code class="bg-gray-100 px-1 rounded">/greeting/{name}</code> to be greeted!<br>
                For example, visit <code class="bg-gray-100 px-1 rounded"><a href="/greeting/dbos" class="text-blue-600 hover:underline">/greeting/dbos</a></code><br>
                The counter increments with each page visit.<br>
            </p>
            <p>
                To learn more about DBOS, check out the <a href="https://docs.dbos.dev" class="text-blue-600 hover:underline">docs</a>.
            </p>
        </body>
        </html>
        """
    return HTMLResponse(readme)


# To deploy this app to DBOS Cloud:
# - "npm i -g @dbos-inc/dbos-cloud@latest" to install the Cloud CLI (requires Node)
# - "dbos-cloud app deploy" to deploy your app
# - Deploy outputs a URL--visit it to see your app!


# To run this app locally:
# - Make sure you have a Postgres database to connect to
# - "dbos migrate" to set up your database tables
# - "dbos start" to start the app
# - Visit localhost:8000 to see your app!
