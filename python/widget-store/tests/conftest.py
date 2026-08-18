import os

import pytest
import sqlalchemy as sa
from dbos import DBOS, DBOSConfig, SQLAlchemyDatasource
from sqlalchemy.engine.url import make_url

import widget_store.main as widget_store


def reset_database(test_database_url: str):
    url = make_url(test_database_url)
    database = url.database
    postgres_db_url = url.set(database="postgres")
    engine = sa.create_engine(postgres_db_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(
            sa.text(
                f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{database}'"
            )
        )
        conn.execute(sa.text(f"DROP DATABASE IF EXISTS {database}"))
        conn.execute(sa.text(f"CREATE DATABASE {database}"))
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
    reset_database(test_database_url)
    DBOS(config=config)
    widget_store.ds = SQLAlchemyDatasource.create(test_database_url)
    DBOS.launch()
