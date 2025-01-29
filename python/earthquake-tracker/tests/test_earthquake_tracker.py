from datetime import UTC, datetime, timedelta

from earthquake_tracker.main import get_earthquake_data


def test_get_data(dbos):
    end_time = datetime.now(UTC)
    start_time = end_time - timedelta(hours=24)
    earthquakes = get_earthquake_data(start_time, end_time)
    print(earthquakes)
