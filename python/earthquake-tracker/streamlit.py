import streamlit as st
import pandas as pd
from sqlalchemy import create_engine, desc, select
from schema import earthquake_tracker
from dbos.dbos_config import load_config, ConfigFile

config: ConfigFile = load_config()

# Database connection parameters
db_params = {
    'host': config["database"]["hostname"],
    'database': config["database"]["app_db_name"],
    'user': config["database"]["username"],
    'password': config["database"]["password"],
    'port': config["database"]["port"]
}

engine = create_engine(f"postgresql://{db_params['user']}:{db_params['password']}@{db_params['host']}:{db_params['port']}/{db_params['database']}")


if __name__ == "__main__":
    st.title("Postgres Table Display")

    query = select(earthquake_tracker).order_by(desc(earthquake_tracker.c.timestamp)).limit(1000)

    # Fetch data
    df = pd.read_sql(query, engine)
    df['timestamp'] = pd.to_numeric(df['timestamp'], errors='coerce')
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    df = df.drop(columns=['id'])

    # Display the dataframe as a table
    st.table(df)
