# Welcome to DBOS!

# This is a DBOS port of the stock prices monitoring app showcased in
# https://python.plainenglish.io/building-and-deploying-a-stock-price-monitoring-system-with-aws-lambda-rds-postgresql-and-4abef0b3968a

# It periodically fetches stock prices from Yahoo Finance and stores them in a Postgres database.

# First, let's do imports, and initialize DBOS.

from dbos import DBOS
from schema import stock_prices, alerts
import yfinance as yf
from twilio.rest import Client
import os
import pytz
import datetime
import threading

DBOS()

# Then let's write a function that fetches stock prices from Yahoo Finance.
# We annotate this function with `@DBOS.step` so we can call it from a durable workflow later on.
@DBOS.step()
def fetch_stock_price(symbol):
    stock = yf.Ticker(symbol)
    data = stock.history(period="1d")
    if data.empty:
        raise ValueError("No stock data found for the symbol.")
    DBOS.logger.info(f"Stock price for {symbol} is {data['Close'].iloc[0]}")
    return data['Close'].iloc[0]

# Next, let's write a function that saves stock prices to a Postgres database.
@DBOS.transaction()
def save_to_db(symbol, price):
    DBOS.sql_session.execute(stock_prices.insert().values(stock_symbol=symbol, stock_price=price))

# Now, let's write a function that will send an SMS alert.
# We will use Twilio for this. You can sign up for a free Twilio account at https://www.twilio.com/try-twilio
# We define use environment variables dbos-config.yaml to store our Twilio account SID, auth token, phone number, and our own phone number.
twilio_account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
twilio_auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
twilio_phone_number = os.environ.get('TWILIO_PHONE_NUMBER')
@DBOS.step()
def send_sms_alert(symbol, price, to_phone_number):
    client = Client(twilio_account_sid, twilio_auth_token)
    message = client.messages.create(
        body=f"{symbol} stock price is {price}.",
        from_=twilio_phone_number,
        to=to_phone_number
    )
    DBOS.logger.info(f"SMS sent: {message.sid}")

# Let's write a small function to retrieve alerts from the database
@DBOS.transaction()
def fetch_alerts():
    query = alerts.select()
    return {alert.stock_symbol:alert for alert in DBOS.sql_session.execute(query).fetchall()}

# Then, let's write a scheduled job that fetches stock prices for a list of symbols every minute.
# The @DBOS.scheduled() decorator tells DBOS to run this function on a cron schedule.
# The @DBOS.workflow() decorator tells DBOS to run this function as a reliable workflow, so it runs exactly-once per minute.
symbols = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'NVDA']
@DBOS.scheduled('* * * * *')
@DBOS.workflow()
def fetch_stock_prices_workflow(scheduled_time: datetime, actual_time: datetime):
    # Fetch registered alerts
    registered_alerts = fetch_alerts()
    # Fetch stock prices for each symbol
    for symbol in symbols:
        price = fetch_stock_price(symbol)
        save_to_db(symbol, price)
        # If there is a registered alert for that symbol, send a SMS if the price is above the alert threshold
        if registered_alerts and symbol in registered_alerts:
            if price > registered_alerts[symbol].price_threshold:
                send_sms_alert(symbol, price, registered_alerts[symbol].phone_number)

# Finally, in our main function, let's launch DBOS, then sleep the main thread forever
# while the background threads run.
if __name__ == "__main__":
    DBOS.launch()
    threading.Event().wait()
# To deploy this app to the cloud as a persistent cron job, run `dbos-cloud app deploy`
