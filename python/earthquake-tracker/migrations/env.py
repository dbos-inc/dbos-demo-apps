import os
from logging.config import fileConfig

from alembic import context
from dbos.dbos_config import load_config
from sqlalchemy import URL, engine_from_config, pool

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Load DBOS Config and parse the database URL
dbos_config_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.realpath(__file__))), "dbos-config.yaml"
)

dbos_config = load_config(dbos_config_path)
db_url = URL.create(
    "postgresql",
    username=dbos_config["database"]["username"],
    password=dbos_config["database"]["password"],
    host=dbos_config["database"]["hostname"],
    port=dbos_config["database"]["port"],
    database=dbos_config["database"]["app_db_name"],
)
config.set_main_option("sqlalchemy.url", db_url.render_as_string(hide_password=False))

# Import our schema for migration autogeneration
from earthquake_tracker.schema import metadata

target_metadata = metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
