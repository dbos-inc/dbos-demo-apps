import os

import pytest
import sqlalchemy as sa
from dbos import DBOS, DBOSConfig, SQLAlchemyDatasource
from sqlalchemy.engine.url import make_url

import widget_store.main as widget_store


def create_database(test_database_url: str):
    url = make_url(test_database_url)
    postgres_db_url = url.set(database="postgres")
    engine = sa.create_engine(postgres_db_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(sa.text(f"CREATE DATABASE {url.database}"))
    engine.dispose()


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
    DBOS.reset_system_database()
    create_database(test_database_url)
    widget_store.ds = SQLAlchemyDatasource.create(test_database_url)
    DBOS.launch()
