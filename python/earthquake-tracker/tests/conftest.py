import os

import pytest
import sqlalchemy as sa
from alembic import script
from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.environment import EnvironmentContext
from alembic.runtime.migration import MigrationContext
from dbos import DBOS, ConfigFile, load_config


def reset_database(config: ConfigFile):
    db_config = config["database"]

    postgres_db_url = sa.URL.create(
        "postgresql+psycopg",
        username=db_config["username"],
        password=db_config["password"],
        host=db_config["hostname"],
        port=db_config["port"],
        database="postgres",
    )
    engine = sa.create_engine(postgres_db_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(
            sa.text(
                f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{db_config["app_db_name"]}'"
            )
        )
        conn.execute(sa.text(f"DROP DATABASE IF EXISTS {db_config["app_db_name"]}"))
        conn.execute(sa.text(f"CREATE DATABASE {db_config["app_db_name"]}"))


def run_migrations(config: ConfigFile):
    db_config = config["database"]
    app_db_url = sa.URL.create(
        "postgresql+psycopg",
        username=db_config["username"],
        password=db_config["password"],
        host=db_config["hostname"],
        port=db_config["port"],
        database=db_config["app_db_name"],
    )
    migration_dir = os.path.join(".", "migrations")
    alembic_cfg = Config()
    alembic_cfg.set_main_option("script_location", migration_dir)

    # Create engine from URL
    eng = sa.create_engine(app_db_url)

    # Get ScriptDirectory instance
    script_dir = script.ScriptDirectory.from_config(alembic_cfg)

    def do_run_migrations(connection):
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            current_rev = context.get_current_revision()
            print(f"Current revision: {current_rev}")

            # Get the migration steps
            target_revs = script_dir._upgrade_revs("head", current_rev)
            print(f"Target revisions to apply: {target_revs}")

            # Execute each revision
            for revision in script_dir.walk_revisions("base", "head"):
                migration_script = script_dir._upgrade_revs(
                    revision.revision, current_rev
                )
                if migration_script:
                    print(f"Applying revision: {revision.revision}")
                    revision.module.upgrade()
                    current_rev = revision.revision

    # Run migrations
    with eng.connect() as connection:
        with EnvironmentContext(alembic_cfg, script_dir, fn=do_run_migrations):
            with connection.begin():
                do_run_migrations(connection)


@pytest.fixture()
def dbos():
    DBOS.destroy(destroy_registry=False)
    config = load_config()
    config["database"]["app_db_name"] = f"{config["database"]["app_db_name"]}_test"
    reset_database(config)
    run_migrations(config)
    DBOS(config=config)
    DBOS.launch()
