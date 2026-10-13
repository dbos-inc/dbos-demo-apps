"""Shared migration and application checks for supported database backends."""

import os
import subprocess
import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

ROOT = Path(__file__).resolve().parents[1]

APP_STARTUP = '''
from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import patch

from dbos import DBOS
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.prompt_values import ChatPromptValue
from langchain_core.runnables import RunnableLambda

from reliable_refunds import main


def respond(prompt: ChatPromptValue) -> AIMessage:
    """Request a purchase lookup, then answer without calling an API."""
    if isinstance(prompt.to_messages()[-1], ToolMessage):
        return AIMessage(content="Found your purchases.")
    return AIMessage(content="", tool_calls=[
        {"name": "tool_get_all_purchases", "args": {}, "id": "lookup"}
    ])


@contextmanager
def app_client() -> Iterator[TestClient]:
    """Keep the model mocked through FastAPI startup and request handling."""
    with patch("reliable_refunds.main.ChatOpenAI") as model:
        model.return_value.bind_tools.return_value = RunnableLambda(respond)
        with TestClient(main.app) as client:
            yield client


DBOS.launch()
'''

FIRST_RUN = """
try:
    with app_client() as client:
        assert client.get("/history").json()["message_count"] == 0
        response = client.post("/chat", json={"message": "List my purchases"})
        assert response.status_code == 200, response.text
        assert response.json()[-1]["content"] == "Found your purchases."
        history = client.get("/history").json()
        assert history["message_count"] == 4, history
        assert "Laptop Pro X1" in str(history), history
        refund = main.process_refund.invoke({"order_id": 2})
        assert "approved" in refund, refund
        assert main.get_purchase_by_id(2).order_status == "REFUNDED"
finally:
    DBOS.destroy()
"""

RESTART_RUN = """
try:
    with app_client() as client:
        assert client.get("/history").json()["message_count"] == 4
        assert len(main.get_all_purchases()) == 5
        assert main.get_purchase_by_id(2).order_status == "REFUNDED"
        main.update_purchase_status(1, main.OrderStatus.REFUNDED)
        assert main.get_purchase_by_id(1).order_status == "REFUNDED"
        response = client.post("/reset")
        assert response.status_code == 200, response.text
        assert client.get("/history").json()["message_count"] == 0
        assert main.get_purchase_by_id(1).order_status == "PURCHASED"
        response = client.post("/chat", json={"message": "List purchases again"})
        assert response.status_code == 200, response.text
finally:
    DBOS.destroy()
"""


def _run_process(args: list[str], env: dict[str, str]) -> None:
    """Run a subprocess and include its output when it fails."""
    result = subprocess.run(
        args,
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)


def run_database_scenario(test_case: unittest.TestCase, database_url: str) -> None:
    """Run migrations, app workflows, restart, reset, and repeat migrations."""
    env = dict(
        os.environ,
        DBOS_DATABASE_URL=database_url,
        OPENAI_API_KEY="test-key",
        SENDGRID_API_KEY="test-key",
        SENDGRID_FROM_EMAIL="test@example.com",
        ADMIN_EMAIL="admin@example.com",
        PATH=f"{Path(sys.executable).parent}{os.pathsep}{os.environ['PATH']}",
        CONDUCTOR_KEY="",
    )
    migrate = [str(Path(sys.executable).with_name("dbos")), "migrate"]
    _run_process(migrate, env)

    engine = create_engine(database_url)
    try:
        table_names = inspect(engine).get_table_names()
        test_case.assertIn("purchases", table_names)
        checkpoint_tables = (
            {"checkpoints", "writes"}
            if engine.dialect.name == "sqlite"
            else {"checkpoints", "checkpoint_blobs", "checkpoint_writes"}
        )
        test_case.assertTrue(checkpoint_tables.issubset(table_names), table_names)
        with engine.connect() as connection:
            test_case.assertEqual(
                connection.execute(text("SELECT count(*) FROM purchases")).scalar_one(),
                5,
            )
            test_case.assertEqual(
                connection.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar_one(),
                "fc6545615e90",
            )
    finally:
        engine.dispose()

    _run_process([sys.executable, "-c", APP_STARTUP + FIRST_RUN], env)
    _run_process([sys.executable, "-c", APP_STARTUP + RESTART_RUN], env)
    _run_process(migrate, env)

    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            test_case.assertEqual(
                connection.execute(text("SELECT count(*) FROM purchases")).scalar_one(),
                5,
            )
            for table in checkpoint_tables:
                test_case.assertEqual(
                    connection.execute(
                        text(f'SELECT count(*) FROM "{table}"')
                    ).scalar_one(),
                    0,
                    f"Expected {table} to be empty after migrations reset chat history",
                )
    finally:
        engine.dispose()
