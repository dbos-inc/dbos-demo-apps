"""
Cross-language interop test.

The session-scoped `interop_apps` fixture (see conftest.py) builds and launches
the four apps on ports 8001-8004, all connected to the same DBOS system database,
then tears them down afterward. Each test posts the canonical payload for the
target language to POST /enqueue/{target} on the *source* app; the source relays
it to the target application's echoWorkflow and returns the result.

    uv run pytest -s test_interops.py
"""

import pytest
import requests

from conftest import EXPECTED_ECHO, LANGUAGES, PORTS, TARGET_PAYLOADS, app_url

# All 12 directed source -> target pairs.
PAIRS = [(s, t) for s in LANGUAGES for t in LANGUAGES if s != t]


@pytest.mark.parametrize("source,target", PAIRS, ids=[f"{s}To{t.title()}" for s, t in PAIRS])
def test_cross_language_enqueue(interop_apps, source: str, target: str):
    url = f"{app_url(source)}/enqueue/{target}"
    resp = requests.post(url, json=TARGET_PAYLOADS[target], timeout=15)
    resp.raise_for_status()
    assert resp.json() == EXPECTED_ECHO, (
        f"{source} -> {target}: expected {EXPECTED_ECHO}, got {resp.json()}"
    )
