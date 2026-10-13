"""Integration tests for the SQLite application configuration."""

import tempfile
import unittest
from pathlib import Path

from tests.database_scenario import run_database_scenario


class SQLiteIntegrationTest(unittest.TestCase):
    """Verify migrations, app behavior, persistence, and resets with SQLite."""

    def test_migrate_chat_restart_and_reset(self) -> None:
        """Run the shared database scenario against a temporary SQLite file."""
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "refunds.sqlite"
            run_database_scenario(self, f"sqlite:///{database}")


if __name__ == "__main__":
    unittest.main()
