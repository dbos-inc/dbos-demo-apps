import streamlit as st
import pandas as pd
from sqlalchemy import create_engine



# Database connection parameters
db_params = {
    'host': 'localhost',
    'database': 'earthquake_tracker',
    'user': 'postgres',
    'password': 'dbos',
    'port': '5432'
}

engine = create_engine(f"postgresql://{db_params['user']}:{db_params['password']}@{db_params['host']}:{db_params['port']}/{db_params['database']}")


if __name__ == "__main__":
    st.title("Postgres Table Display")

    query = "SELECT * FROM earthquake_tracker"

    # Fetch data
    df = pd.read_sql(query, engine)

    # Display the dataframe as a table
    st.table(df)
