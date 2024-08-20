from fastapi import FastAPI
from dbos import DBOS
import yfinance as yf

app = FastAPI()
dbos = DBOS(app)

@app.get("/{ticker}")
@dbos.communicator()
def get_stock_price(ticker: str):
    stock = yf.Ticker(ticker)
    return stock.info["currentPrice"]
