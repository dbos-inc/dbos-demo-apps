import os

import pytest
from dbos import DBOS, DBOSConfig


@pytest.fixture()
def test_database_url():
    test_database_url = os.environ.get("DBOS_TEST_DATABASE_URL", None)
    if test_database_url is None:
        pytest.fail("DBOS_TEST_DATABASE_URL is not provided")
    return test_database_url


@pytest.fixture()
def dbos(test_database_url):
    DBOS.destroy()
    config: DBOSConfig = {
        "name": "widget-store",
        "system_database_url": test_database_url,
        "application_version": "0.1.0",
    }
    DBOS(config=config)
    DBOS.reset_system_database(truncate=True)
    DBOS.launch()
