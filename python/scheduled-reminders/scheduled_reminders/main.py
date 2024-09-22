import os

from dbos import DBOS
from fastapi import FastAPI
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

app = FastAPI()
DBOS(fastapi=app)

api_key = os.environ.get("SENDGRID_API_KEY", None)
if api_key is None:
    raise Exception("Error: SENDGRID_API_KEY is not set")

from_email = os.environ.get("SENDGRID_FROM_EMAIL", None)
if from_email is None:
    raise Exception("Error: SENDGRID_FROM_EMAIL is not set")


# @DBOS.step()
def send_email(to_email, time):
    message = Mail(
        from_email=from_email,
        to_emails=to_email,
        subject="DBOS Reminder",
        html_content=f"This is a reminder from DBOS! It has been {time} since your last reminder.",
    )
    email_client = SendGridAPIClient(api_key)
    response = email_client.send(message)

    print(response.status_code)
    print(response.body)
    print(response.headers)


@app.post("/")
def endpoint():
    send_email("peter.kraft@dbos.dev", "one second")
