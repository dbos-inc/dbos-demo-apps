import os
from dbos import DBOS
from fastapi import FastAPI, responses

# Welcome to DBOS!
# This is a template application using DBOS to run some code on a (cron) schedule.

app = FastAPI()
DBOS(fastapi=app)
counter = 0

# This is a simple scheduled function.
# It runs once a minute, incrementing the in-memory counter (the cron syntax "* * * * *" means "once a minute").
# Learn more about scheduled functions here: https://docs.dbos.dev/python/tutorials/scheduled-workflows

@DBOS.scheduled("* * * * *")
@DBOS.step()
def scheduled_function(scheduled_time, actual_time):
    global counter
    counter += 1
    DBOS.logger.info(f"At {scheduled_time}, incremented counter to {counter}")

# This FastAPI endpoint lets you check how many times the scheduled function has run
# since the app started.

@app.get("/counter")
def get_counter():
    return {"counter": counter}

# This endpoint serves the HTML Readme.

@app.get("/")
def readme():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return responses.HTMLResponse(html)
