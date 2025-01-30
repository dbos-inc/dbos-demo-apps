import pytest
import sqlalchemy as sa
from alembic import script
from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.environment import EnvironmentContext
from alembic.runtime.migration import MigrationContext
from dbos import DBOS, ConfigFile, load_config


def reset_database(config: ConfigFile):
    postgres_db_url = sa.URL.create(
        "postgresql+psycopg",
        username=config["database"]["username"],
        password=config["database"]["password"],
        host=config["database"]["hostname"],
        port=config["database"]["port"],
        database="postgres",
    )
    engine = sa.create_engine(postgres_db_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(
            sa.text(
                f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{config["database"]["app_db_name"]}'"
            )
        )
        conn.execute(
            sa.text(f"DROP DATABASE IF EXISTS {config["database"]["app_db_name"]}")
        )
        conn.execute(sa.text(f"CREATE DATABASE {config["database"]["app_db_name"]}"))


def run_migrations(config: ConfigFile):
    app_db_url = sa.URL.create(
        "postgresql+psycopg",
        username=config["database"]["username"],
        password=config["database"]["password"],
        host=config["database"]["hostname"],
        port=config["database"]["port"],
        database=config["database"]["app_db_name"],
    )
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

    with sa.create_engine(app_db_url).connect() as conn:
        with EnvironmentContext(alembic_cfg, script_dir, fn=do_run_migrations):
            with conn.begin():
                do_run_migrations(conn)


@pytest.fixture()
def dbos():
    DBOS.destroy(destroy_registry=False)
    config = load_config()
    config["database"]["app_db_name"] = f"{config["database"]["app_db_name"]}_test"
    reset_database(config)
    run_migrations(config)
    DBOS(config=config)
    DBOS.launch()
