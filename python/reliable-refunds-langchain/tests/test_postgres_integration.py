"""Integration tests for the Postgres application configuration."""

import os
import unittest
import uuid

import psycopg
from psycopg import sql
from sqlalchemy import make_url

from tests.database_scenario import run_database_scenario

POSTGRES_ADMIN_URL = os.environ.get("TEST_POSTGRES_ADMIN_URL")


@unittest.skipUnless(
    POSTGRES_ADMIN_URL,
    "Set TEST_POSTGRES_ADMIN_URL to a Postgres admin URL with CREATEDB privileges",
)
class PostgresIntegrationTest(unittest.TestCase):
    """Run the shared database scenario against an isolated Postgres database."""

    def test_migrate_chat_restart_and_reset(self) -> None:
        """Create a temporary database, exercise the app, and drop that database."""
        assert POSTGRES_ADMIN_URL is not None
        admin_url = make_url(POSTGRES_ADMIN_URL)
        database_name = f"refunds_test_{uuid.uuid4().hex}"
        database_url = admin_url.set(database=database_name).render_as_string(
            hide_password=False
        )
        admin_connection_string = admin_url.set(
            drivername="postgresql"
        ).render_as_string(hide_password=False)

        with psycopg.connect(admin_connection_string, autocommit=True) as connection:
            connection.execute(
                sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name))
            )

        try:
            run_database_scenario(self, database_url)
        finally:
            with psycopg.connect(
                admin_connection_string, autocommit=True
            ) as connection:
                connection.execute(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = %s AND pid <> pg_backend_pid()",
                    (database_name,),
                )
                connection.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {}").format(
                        sql.Identifier(database_name)
                    )
                )


if __name__ == "__main__":
    unittest.main()
