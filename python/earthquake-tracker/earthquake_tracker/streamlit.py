# Earthquake Tracker

# This app uses DBOS to stream earthquake data from the USGS
# into Postgres then displays it using Streamlit.

# This part of the app uses Streamlit for data visualization.
# The ingestion code using DBOS Transact is in main.py.
# We separate the Streamlit script from the DBOS ingestion code
# because Streamlit re-runs the entire script every time it's viewed.

# First, let's do imports and configure Streamlit with a title and some custom CSS.

import dbos
import pandas as pd
import plotly.express as px
import streamlit as st
from schema import earthquake_tracker
from sqlalchemy import create_engine, desc, select

st.set_page_config(page_title="DBOS Earthquake Tracker", layout="wide")
st.markdown(
    """
        <style>
            #MainMenu {visibility: hidden;}
            header {visibility: hidden;}
        </style>
        """,
    unsafe_allow_html=True,
)
st.title("🌎 Earthquake Tracker")
st.markdown(
    "This app uses DBOS to stream earthquake data from the USGS into Postgres and displays it using Streamlit."
)


# Then, let's load database connection information from dbos-config.yaml
# and use it to create a database connection using sqlalchemy.


def load_data():
    database_url = dbos.get_dbos_database_url()
    engine = create_engine(database_url)
    query = (
        select(earthquake_tracker)
        .order_by(desc(earthquake_tracker.c.timestamp))
        .limit(10000)
    )
    df = pd.read_sql(query, engine)
    df["timestamp"] = pd.to_numeric(df["timestamp"], errors="coerce")
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df = df.rename(
        columns={
            "timestamp": "UTC Timestamp",
            "magnitude": "Magnitude",
            "place": "Place",
        }
    )
    return df.drop(columns=["id"])


df = load_data()

# Now, let's put together a data visualization!
# First, we'll add a magnitude slider in a sidebar

with st.sidebar:
    st.header("Filters")
    min_magnitude = st.slider(
        "Minimum Magnitude",
        float(df["Magnitude"].min()),
        float(df["Magnitude"].max()),
        float(df["Magnitude"].min()),
    )
filtered_df = df[(df["Magnitude"] >= min_magnitude)]

# Then, in side-by-side columns, let's display the magnitude distribution and summary statistics of the earthquakes

col1, col2 = st.columns([2, 1])
with col1:
    st.subheader("📊 Magnitude Distribution")
    fig = px.histogram(
        filtered_df, x="Magnitude", nbins=20, color_discrete_sequence=["#4CAF50"]
    )
    fig.update_layout(xaxis_title="Magnitude", yaxis_title="Count", bargap=0.1)
    st.plotly_chart(fig, use_container_width=True)
with col2:
    st.subheader("📈 Summary Statistics")
    total_earthquakes = len(filtered_df)
    avg_magnitude = filtered_df["Magnitude"].mean()
    max_magnitude = filtered_df["Magnitude"].max()

    st.metric("Total Earthquakes", f"{total_earthquakes:,}")
    st.metric("Average Magnitude", f"{avg_magnitude:.2f}")
    st.metric("Max Magnitude", f"{max_magnitude:.2f}")

# Finally, let's add a sortable data table with all the raw earthquake data
st.dataframe(filtered_df, use_container_width=True)
