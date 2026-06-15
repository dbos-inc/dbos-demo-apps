"""
Cross-language interop test.

Assumes the four apps are already running (see README) on ports 8001-8004,
all connected to the same DBOS system database. Each test posts the canonical
payload for the target language to POST /enqueue/{target} on the *source* app;
the source relays it via portable enqueue and returns the workflow result.

    pip install pytest requests
    pytest -s test_interops.py
"""

import pytest
import requests

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

# Per-target payloads. Each target's echoWorkflow has a different signature, so
# the {positionalArgs, namedArgs} envelope is shaped to match it:
#   go         — one typed struct as positionalArgs[0]
#   python     — 3 positional args + 2 named kwargs (val_float, val_date)
#   typescript — 5 positional args (text, num, float, items, date)
#   java       — 5 positional args (text, num, float, items, date)
TARGET_PAYLOADS = {
    "go": {
        "positionalArgs": [
            {"text": "hello-interop", "num": 42, "float": 3.14,
             "items": ["alpha", "beta", "gamma"], "date": "2025-01-15"},
        ],
        "namedArgs": {},
    },
    "python": {
        "positionalArgs": ["hello-interop", 42, ["alpha", "beta", "gamma"]],
        "namedArgs": {"val_float": 3.14, "val_date": "2025-01-15"},
    },
    "typescript": {
        "positionalArgs": ["hello-interop", 42, 3.14, ["alpha", "beta", "gamma"], "2025-01-15"],
        "namedArgs": {},
    },
    "java": {
        "positionalArgs": ["hello-interop", 42, 3.14, ["alpha", "beta", "gamma"], "2025-01-15"],
        "namedArgs": {},
    },
}

# All 12 directed source -> target pairs.
PAIRS = [
    (s, t) for s in PORTS for t in PORTS if s != t
]


@pytest.mark.parametrize("source,target", PAIRS, ids=[f"{s}To{t.title()}" for s, t in PAIRS])
def test_cross_language_enqueue(source: str, target: str):
    url = f"http://localhost:{PORTS[source]}/enqueue/{target}"
    resp = requests.post(url, json=TARGET_PAYLOADS[target], timeout=15)
    resp.raise_for_status()
    assert resp.json() == EXPECTED, (
        f"{source} -> {target}: expected {EXPECTED}, got {resp.json()}"
    )
