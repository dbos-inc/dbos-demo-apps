from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from earthquake_tracker.main import (
    EarthquakeData,
    get_earthquake_data,
    record_earthquake_data,
    run_every_minute,
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


def test_main_workflow(dbos):
    """
    Use mocks to test that the main workflow function (run_every_minute)
    correctly records a retrieved earthquake.
    """
    now = datetime.now()
    scheduled_time = now
    actual_time = now
    earthquake: EarthquakeData = {
        "id": "ci40171730",
        "place": "15 km SW of Searles Valley, CA",
        "magnitude": 2.21,
        "timestamp": 1738136375670,
    }
    # Create a mock for get_earthquake_data that returns one earthquake
    with patch("earthquake_tracker.main.get_earthquake_data") as mock_get_data:
        mock_get_data.return_value = [earthquake]

        # Create a mock for record_earthquake_data
        with patch(
            "earthquake_tracker.main.record_earthquake_data"
        ) as mock_record_data:
            mock_record_data.return_value = True

            # Call the main workflow
            run_every_minute(scheduled_time, actual_time)

            # Verify get_earthquake_data was called once with correct parameters
            start_time = scheduled_time - timedelta(hours=1)
            mock_get_data.assert_called_once_with(start_time, scheduled_time)

            # Verify record_earthquake_data was called once with correct parameters
            mock_record_data.assert_called_once_with(earthquake)
