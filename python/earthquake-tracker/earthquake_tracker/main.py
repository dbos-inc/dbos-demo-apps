# Earthquake Tracker

# This app uses DBOS to stream earthquake data from the USGS
# into Postgres then displays it using Streamlit.

# First, let's do imports and initialize DBOS.

import threading
from datetime import datetime, timedelta
from typing import TypedDict

import requests
from dbos import DBOS
from schema import earthquake_tracker
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

DBOS()

# Then, let's write a function that queries the USGS for information on recent earthquakes.
# Our function will take in a time range and return the id, place, magnitude, and timestamp
# of all earthquakes that occured in that time range.
# We annotate this function with `@DBOS.step` so we can call it from a durable workflow later on.


class EarthquakeData(TypedDict):
    id: str
    place: str
    magnitude: float
    timestamp: str


@DBOS.step()
def get_earthquake_data(
    start_time: datetime, end_time: datetime
) -> list[EarthquakeData]:
    # USGS API endpoint for earthquake data
    url = "https://earthquake.usgs.gov/fdsnws/event/1/query"

    # Format times for the API request
    end_time_str = end_time.strftime("%Y-%m-%dT%H:%M:%S")
    start_time_str = start_time.strftime("%Y-%m-%dT%H:%M:%S")

    # Parameters for the API request
    params = {
        "format": "geojson",
        "starttime": start_time_str,
        "endtime": end_time_str,
        "minmagnitude": 1.0,
    }

    # Make the API request
    response = requests.get(url, params=params)

    # Return the output of the request
    if response.status_code == 200:
        data = response.json()
        earthquakes = []
        for item in data["features"]:
            earthquake: EarthquakeData = {
                "id": item["id"],
                "place": item["properties"]["place"],
                "magnitude": item["properties"]["mag"],
                "timestamp": item["properties"]["time"],
            }
            earthquakes.append(earthquake)
        return earthquakes
    else:
        raise Exception(
            f"Error fetching data from USGS: {response.status_code} {response.text}"
        )


# Next, let's use a DBOS transaction to record each earthquake in Postgres.
# If the earthquake is already recorded, update its record with new data.
# Return true if we inserted a new earthquake, false if we updated an existing one.


@DBOS.transaction()
def record_earthquake_data(data: EarthquakeData) -> bool:
    return DBOS.sql_session.execute(
        insert(earthquake_tracker)
        .values(**data)
        .on_conflict_do_update(index_elements=["id"], set_=data)
        .returning(text("xmax = 0 AS inserted"))
    ).scalar_one()


# Then, let's write a cron job that records earthquakes every minute.
# Because earthquake data is sometimes updated later, we run over the last hour of data,
# recording new earthquakes and updating records of existing earthquakes.
# The @DBOS.scheduled() decorator tells DBOS to run this function on a cron schedule.
# The @DBOS.workflow() decorator tells DBOS to run this function as a reliable workflow,
# so it runs exactly-once per minute and you'll never miss an earthquake or record a duplicate.


@DBOS.scheduled("* * * * *")
@DBOS.workflow()
def run_every_minute(scheduled_time: datetime, actual_time: datetime):
    end_time = scheduled_time
    start_time = scheduled_time - timedelta(hours=1)
    earthquakes = get_earthquake_data(start_time, end_time)
    if len(earthquakes) == 0:
        DBOS.logger.info(f"No earthquakes found between {start_time} and {end_time}")
    for earthquake in earthquakes:
        new_earthquake = record_earthquake_data(earthquake)
        if new_earthquake:
            DBOS.logger.info(f"Recorded earthquake: {earthquake}")


# Finally, in our main function, let's launch DBOS, then sleep the main thread forever
# while the background threads run.

if __name__ == "__main__":
    DBOS.launch()
    threading.Event().wait()

# To deploy this app to the cloud as a persistent cron job and dashboard, run `dbos-cloud app deploy`
# To see the code for the Streamlit visualization, check out streamlit.py
