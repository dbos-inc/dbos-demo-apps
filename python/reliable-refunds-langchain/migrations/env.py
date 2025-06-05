import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, create_engine, text
from sqlalchemy.engine import make_url

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def create_database_if_not_exists(conn_string):
    """Create the database if it doesn't exist."""
    # Parse the connection string to extract database name and connection details
    parsed_url = make_url(conn_string)

    # Extract database name
    database_name = parsed_url.database

    # Create connection string without database name (connect to default 'postgres' database)
    admin_url = parsed_url.set(database='postgres')

    try:
        # Connect to PostgreSQL server (postgres database)
        admin_engine = create_engine(admin_url, isolation_level='AUTOCOMMIT')

        with admin_engine.connect() as conn:
            # Check if database exists
            result = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :db_name"),
                {"db_name": database_name}
            )

            if not result.fetchone():
                # Database doesn't exist, create it
                print(f"Creating database: {database_name}")
                conn.execute(text(f'CREATE DATABASE "{database_name}"'))
                print(f"Database {database_name} created successfully")
            else:
                print(f"Database {database_name} already exists")

    except Exception as e:
        print(f"Error creating database: {e}")
        raise


# Programmatically set the sqlalchemy.url field to the DBOS application database URL
conn_string = os.environ.get("DBOS_DATABASE_URL", "postgresql+psycopg://postgres:dbos@localhost:5432/reliable_refunds_langchain?connect_timeout=5")
config.set_main_option("sqlalchemy.url", conn_string)

# Create database if it doesn't exist
create_database_if_not_exists(conn_string)

# add your model's MetaData object here
# for 'autogenerate' support
from reliable_refunds.schema import metadata

target_metadata = metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


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
