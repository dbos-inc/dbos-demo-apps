import os

from dbos import DBOS
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr
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


@DBOS.step()
def send_email(to_email: str, time: str):
    message = Mail(
        from_email=from_email,
        to_emails=to_email,
        subject="DBOS Reminder",
        html_content=f"This is a reminder from DBOS! It has been {time} since your last reminder.",
    )
    email_client = SendGridAPIClient(api_key)
    email_client.send(message)
    DBOS.logger.info(f"Email sent to {to_email} at time {time}")


@DBOS.workflow()
def reminder_workflow(to_email: str):
    DBOS.sleep(60)  # Wait for one minute
    send_email(to_email, time="one minute")

    DBOS.sleep(24 * 60 * 60)  # Wait for one day
    send_email(to_email, time="one day")

    DBOS.sleep(7 * 24 * 60 * 60)  # Wait for one week
    send_email(to_email, time="one week")

    DBOS.sleep(30 * 24 * 60 * 60)  # Wait for one month (30 days)
    send_email(to_email, time="one month")

class EmailSchema(BaseModel):
    email: EmailStr

@app.post("/email")
def email_endpoint(email: EmailSchema):
    DBOS.logger.info(email)
    # DBOS.start_workflow(reminder_workflow, "peter.kraft@dbos.dev")

@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)