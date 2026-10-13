"""Check URL handling through the real Alembic configuration without a database."""

import os
import runpy
import unittest
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from alembic.config import Config
from alembic.runtime.environment import EnvironmentContext
from alembic.script import ScriptDirectory
from sqlalchemy import make_url
from sqlalchemy.engine import URL

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


class MigrationConfigTest(unittest.TestCase):
    """Verify that Alembic preserves percent signs in database URLs."""

    def _load_database_url(self, database_url: str) -> URL:
        """Load env.py offline and return the parsed URL after checking preservation."""
        config = Config()
        # Run env.py in a real offline Alembic context. An empty migration list
        # exercises configuration without executing schema changes or connecting.
        with (
            patch.dict(os.environ, {"DBOS_DATABASE_URL": database_url}),
            EnvironmentContext(
                config,
                ScriptDirectory(str(MIGRATIONS)),
                as_sql=True,
                fn=lambda heads, context: [],
                output_buffer=StringIO(),
            ),
        ):
            runpy.run_path(str(MIGRATIONS / "env.py"))

        configured_url = config.get_main_option("sqlalchemy.url")
        self.assertEqual(configured_url, database_url)
        return make_url(configured_url)

    def test_literal_percent_in_password(self) -> None:
        """Preserve a literal percent sign in the database password."""
        url = self._load_database_url(
            "postgresql+psycopg://demo:pass%word@localhost/refunds"
        )
        self.assertEqual(url.password, "pass%word")

    def test_percent_encoded_percent_in_password(self) -> None:
        """Preserve an encoded percent sign and decode it once in the password."""
        url = self._load_database_url(
            "postgresql+psycopg://demo:pass%25word@localhost/refunds"
        )
        self.assertEqual(url.password, "pass%word")

    def test_percent_encoded_percent_in_query(self) -> None:
        """Preserve an encoded percent sign in a connection query parameter."""
        url = self._load_database_url(
            "postgresql+psycopg://demo@localhost/refunds"
            "?application_name=refunds%25demo"
        )
        self.assertEqual(url.query["application_name"], "refunds%demo")


if __name__ == "__main__":
    unittest.main()
