# Earthquake Tracker

# This app uses DBOS to stream earthquake data from the USGS
# into Postgres then displays it using Streamlit.

# This part of the app uses Streamlit for data visualization.
# The ingestion code using DBOS Transact is in main.py.
# We separate the Streamlit script from the DBOS ingestion code
# because Streamlit re-runs the entire script every time it's viewed.

# First, let's do imports.

import pandas as pd
import streamlit as st
from dbos.dbos_config import ConfigFile, load_config
from schema import earthquake_tracker
from sqlalchemy import create_engine, desc, select

# Then, let's load database connection information from dbos-config.yaml
# and use it to create a database connection using sqlalchemy.

config: ConfigFile = load_config()
db_params = {
    "host": config["database"]["hostname"],
    "database": config["database"]["app_db_name"],
    "user": config["database"]["username"],
    "password": config["database"]["password"],
    "port": config["database"]["port"],
}
engine = create_engine(
    f"postgresql://{db_params['user']}:{db_params['password']}@{db_params['host']}:{db_params['port']}/{db_params['database']}"
)

# Next, let's read the most recent 1000 earthquakes from the database into a pandas dataframe.

query = (
    select(earthquake_tracker)
    .order_by(desc(earthquake_tracker.c.timestamp))
    .limit(1000)
)
df = pd.read_sql(query, engine)

# We do some transformations to the dataframe to make it more human-readable.
# In particular, transform UNIX epoch timestamps into Python datetimes.

df["timestamp"] = pd.to_numeric(df["timestamp"], errors="coerce")
df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
df = df.rename(
    columns={"timestamp": "UTC Timestamp", "magnitude": "Magnitude", "place": "Place"}
)
df = df.drop(columns=["id"])

# Finally, we display our dataframe using Streamlit.

st.set_page_config(page_title="DBOS Earthquake Tracker")
st.title("Earthquake Tracker")
st.table(df)
