from datetime import timezone, datetime, timedelta

from earthquake_tracker.main import (
    EarthquakeData,
    get_earthquake_data,
    record_earthquake_data,
)


def test_get_data(dbos):
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=24)
    earthquakes = get_earthquake_data(start_time, end_time)
    assert len(earthquakes) > 0
    for earthquake in earthquakes:
        assert isinstance(earthquake["id"], str)
        assert isinstance(earthquake["place"], str)
        assert (
            isinstance(earthquake["magnitude"], (int, float))
            and earthquake["magnitude"] > 0.0
        )
        assert (
            isinstance(earthquake["timestamp"], int)
            and int(earthquake["timestamp"]) > 0
        )


def test_record_data(dbos):
    earthquake: EarthquakeData = {
        "id": "ci40171730",
        "place": "15 km SW of Searles Valley, CA",
        "magnitude": 2.21,
        "timestamp": 1738136375670,
    }
    assert record_earthquake_data(earthquake) is True
