# This app uses DBOS to schedule reminder emails for any day in the future.

# First, let's do imports and initialize DBOS.

import os
from datetime import datetime

from dbos import DBOS, DBOSConfig, SetWorkflowID
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

app = FastAPI()
config: DBOSConfig = {
    "name": "scheduled-reminders",
    "database_url": os.environ.get('DBOS_DATABASE_URL'),
}
DBOS(fastapi=app, config=config)

# Next, let's write the workflow that sends emails.
# We'll send a quick confirmation email, then wait
# until the scheduled day, then send the reminder email.

# Because we use a DBOS durably executed workflow, waiting
# until the scheduled day is easy, no matter how far away
# that day is: just sleep!

# Under the hood, this works because when you first call
# DBOS.sleep, it records its wakeup time in the database.
# That way, even if your program is interrupted or restarted
# multiple times during a days-long sleep, it still wakes
# up on schedule and sends the reminder email.


@DBOS.workflow()
def reminder_workflow(
    to_email: str, send_date: datetime, start_date: datetime, seconds_to_wait: int
):
    send_email(
        to_email,
        subject="DBOS Reminder Confirmation",
        message=f"Thank you for signing up for DBOS reminders! You will receive a reminder on {send_date}.",
    )
    DBOS.sleep(seconds_to_wait)
    send_email(
        to_email,
        subject="DBOS Reminder",
        message=f"This is a reminder from DBOS! You requested this reminder on {start_date}.",
    )


# Now, let's write the actual email-sending code using SendGrid.
# First, we'll load a couple environment variables needed by SendGrid.

api_key = os.environ.get("SENDGRID_API_KEY", None)
if api_key is None:
    raise Exception("Error: SENDGRID_API_KEY is not set")

from_email = os.environ.get("SENDGRID_FROM_EMAIL", None)
if from_email is None:
    raise Exception("Error: SENDGRID_FROM_EMAIL is not set")


# Then, we implement the send_email function using SendGrid's API.
# We annotate this function with @DBOS.step() so the reminder workflow
# calls it durably and doesn't re-execute it if restarted.


@DBOS.step()
def send_email(to_email: str, subject: str, message: str):
    message = Mail(
        from_email=from_email, to_emails=to_email, subject=subject, html_content=message
    )
    email_client = SendGridAPIClient(api_key)
    email_client.send(message)
    DBOS.logger.info(f"Email sent to {to_email}")


# Next, let's use FastAPI to write an HTTP endpoint for scheduling reminder emails.
# The endpoint takes in an email address and a scheduled date and starts a reminder
# workflow in the background.

# As a basic anti-spam measure, we'll use the supplied email address and date as an idempotency key.
# That way, you can only send one reminder to any email address per day.


class RequestSchema(BaseModel):
    email: EmailStr
    date: str


@app.post("/email")
def email_endpoint(request: RequestSchema):
    send_date = datetime.strptime(request.date, "%Y-%m-%d").date()
    today_date = datetime.now().date()
    with SetWorkflowID(f"{request.email}-{request.date}"):
        days_to_wait = (send_date - today_date).days
        seconds_to_wait = days_to_wait * 24 * 60 * 60
        DBOS.start_workflow(
            reminder_workflow, request.email, send_date, today_date, seconds_to_wait
        )


# Finally, let's serve the app's frontend from an HTML file using FastAPI.
# In production, we recommend using DBOS primarily for the backend,
# with your frontend deployed elsewhere.


@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)


# To deploy this app to the cloud and send your own reminder emails,
# configure the SendGrid environment variables then run `dbos-cloud app deploy`.
