from datetime import UTC, datetime, timedelta
from typing import TypedDict

import requests
from dbos import DBOS

from schema import earthquake_tracker


class EarthquakeData(TypedDict):
    place: str
    magnitude: float
    timestamp: str


dbos = DBOS()


@dbos.transaction()
def record_earthquake_data(data: EarthquakeData):
    DBOS.sql_session.execute(earthquake_tracker.insert().values(**data))


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
        "minmagnitude": 1.5,
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


@dbos.workflow()
def run_hourly(scheduled_time: datetime, actual_time: datetime):
    end_time = scheduled_time
    start_time = scheduled_time - timedelta(hours=1)
    earthquakes = get_earthquake_data(start_time, end_time)
    if len(earthquakes) == 0:
        DBOS.logger.info(f"No earthquakes recorded between {start_time} and {end_time}")
    for earthquake in earthquakes:
        record_earthquake_data(earthquake)
        DBOS.logger.info(f"Recorded earthquake: {earthquake}")


if __name__ == "__main__":
    run_hourly(datetime.now(UTC), 0)
