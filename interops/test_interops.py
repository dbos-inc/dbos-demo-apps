"""
Cross-language interop test.

The session-scoped `interop_apps` fixture (see conftest.py) builds and launches
the four apps on ports 8001-8004, all connected to the same DBOS system database,
then tears them down afterward. Each test posts the canonical payload for the
target language to POST /enqueue/{target} on the *source* app; the source relays
it via portable enqueue and returns the workflow result.

    uv run pytest -s test_interops.py
"""

import pytest
import requests

from conftest import TARGET_PAYLOADS

PORTS = {
    "python":     8001,
    "typescript": 8002,
    "go":         8003,
    "java":       8004,
}

# Echo workflow output, identical regardless of which runtime ran it.
EXPECTED = {
    "echo_text":   "hello-interop",
    "echo_num":    42,
    "echo_float":  3.14,
    "items_count": 3,
    "echo_date":   "2025-01-15",
    "msg_date":    "2025-03-15",
}

# All 12 directed source -> target pairs.
PAIRS = [
    (s, t) for s in PORTS for t in PORTS if s != t
]


@pytest.mark.parametrize("source,target", PAIRS, ids=[f"{s}To{t.title()}" for s, t in PAIRS])
def test_cross_language_enqueue(interop_apps, source: str, target: str):
    url = f"http://localhost:{PORTS[source]}/enqueue/{target}"
    resp = requests.post(url, json=TARGET_PAYLOADS[target], timeout=15)
    resp.raise_for_status()
    assert resp.json() == EXPECTED, (
        f"{source} -> {target}: expected {EXPECTED}, got {resp.json()}"
    )
