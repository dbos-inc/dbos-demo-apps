from datetime import UTC, datetime, timedelta

from earthquake_tracker.main import get_earthquake_data


def test_get_data(dbos):
    end_time = datetime.now(UTC)
    start_time = end_time - timedelta(hours=24)
    earthquakes = get_earthquake_data(start_time, end_time)
    assert(len(earthquakes) > 0)
    for earthquake in earthquakes:
        assert isinstance(earthquake['id'], str)
        assert isinstance(earthquake['place'], str)
        assert isinstance(earthquake["magnitude"], (int, float)) and earthquake["magnitude"] > 0.0
        assert isinstance(earthquake["timestamp"], int) and int(earthquake["timestamp"]) > 0
