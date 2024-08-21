# Earthquake Tracker

# This app uses DBOS to deploy a cron job that streams earthquake data from the USGS into
# Postgres then displays it using streamlit.

# First, let's do imports and create a DBOS app.

from datetime import datetime, timedelta
from typing import TypedDict

import requests
from dbos import DBOS

from schema import earthquake_tracker

dbos = DBOS()

# Then, let's write a function that queries the USGS for information on recent earthquakes.
# Our function will take in a time range and return the place, magnitude, and timestamp
# of all earthquakes that occured in that time range.


class EarthquakeData(TypedDict):
    place: str
    magnitude: float
    timestamp: str


@dbos.communicator()
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


@dbos.transaction()
def record_earthquake_data(data: EarthquakeData):
    DBOS.sql_session.execute(earthquake_tracker.insert().values(**data))


# Finally, let's write a cron job that records earthquakes every minute.
# The @dbos.scheduled() decorator tells DBOS to run this function on a cron schedule.
# The @dbos.workflow() decorator tells DBOS to run this function as a reliable workflow,
# so it runs exactly-once per minute and you'll never miss an earthquake or record a duplicate.


@dbos.scheduled("* * * * *")
@dbos.workflow()
def run_every_minute(scheduled_time: datetime, actual_time: datetime):
    end_time = scheduled_time
    start_time = scheduled_time - timedelta(minutes=1)
    earthquakes = get_earthquake_data(start_time, end_time)
    if len(earthquakes) == 0:
        DBOS.logger.info(f"No earthquakes recorded between {start_time} and {end_time}")
    for earthquake in earthquakes:
        record_earthquake_data(earthquake)
        DBOS.logger.info(f"Recorded earthquake: {earthquake}")


# To deploy this app to the cloud as a persistent cron job and dashboard, run `dbos-cloud app deploy`
# To see the code for the Streamlit visualization, check out streamlit.py
