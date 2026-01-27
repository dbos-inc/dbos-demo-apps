import os
import pytest
import sqlalchemy as sa
from alembic import script
from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.environment import EnvironmentContext
from alembic.runtime.migration import MigrationContext
from dbos import DBOS, DBOSConfig
from sqlalchemy.engine.url import make_url

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


def run_migrations(test_database_url: str):
    alembic_cfg = Config()
    alembic_cfg.set_main_option("script_location", "./migrations")
    script_dir = script.ScriptDirectory.from_config(alembic_cfg)

    def do_run_migrations(connection):
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            for revision in script_dir.walk_revisions("base", "head"):
                if script_dir._upgrade_revs(
                    revision.revision, context.get_current_revision()
                ):
                    revision.module.upgrade()

    with sa.create_engine(test_database_url).connect() as conn:
        with EnvironmentContext(alembic_cfg, script_dir, fn=do_run_migrations):
            with conn.begin():
                do_run_migrations(conn)

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
        "name": "earthquake-tracker",
        "database_url": test_database_url,
        "application_version": "0.1.0",
    }
    reset_database(config["database_url"])
    run_migrations(config["database_url"])
    DBOS(config=config)
    DBOS.reset_system_database()
    DBOS.launch()
