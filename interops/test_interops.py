"""
Cross-language interop test.

The session-scoped `interop_apps` fixture (see conftest.py) builds and launches
the four apps on ports 8001-8004, all connected to the same DBOS system database,
then tears them down afterward. Each test posts the canonical payload for the
target language to POST /enqueue/{target} on the *source* app; the source relays
it via portable enqueue and returns the workflow result.

    uv run pytest -s test_interops.py
"""

import json

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


# The canonical portable error envelope every runtime's failWorkflow produces.
# Each raises it natively (Go/Java via their PortableWorkflowError type, TS via an
# Error whose name/code/data the portable serializer records, Python via a class
# named InteropError since its serializer derives the envelope name from the
# class). Whichever runtime deserializes it must recover the same four fields.
EXPECTED_ERROR = {
    "name":    "InteropError",
    "message": "interop boom",
    "code":    418,
    "data":    {"detail": "teapot"},
}


@pytest.mark.parametrize("source,target", PAIRS, ids=[f"{s}To{t.title()}" for s, t in PAIRS])
def test_cross_language_portable_error(interop_apps, source: str, target: str):
    """The source enqueues the target's failWorkflow, which always fails with the
    canonical portable error envelope. The target serializes the error as
    cross-language JSON; the source must deserialize the same name/message/code/data
    regardless of which runtime raised it."""
    url = f"http://localhost:{PORTS[source]}/error/{target}"
    resp = requests.post(url, timeout=15)
    resp.raise_for_status()
    body = resp.json()

    assert body["name"] == EXPECTED_ERROR["name"], (
        f"{source} -> {target}: name {body.get('name')!r}"
    )
    assert body["message"] == EXPECTED_ERROR["message"], (
        f"{source} -> {target}: message {body.get('message')!r}"
    )
    # Code crosses the wire as a JSON number; normalize float/int before comparing.
    assert int(body["code"]) == EXPECTED_ERROR["code"], (
        f"{source} -> {target}: code {body.get('code')!r}"
    )
    assert body["data"] == EXPECTED_ERROR["data"], (
        f"{source} -> {target}: data {body.get('data')!r}"
    )


# Debounce sources: languages whose client debouncer implements the DB-backed
# delayed-workflow scheme and can target a configured-instance workflow.
#   - typescript is excluded: its DebouncerClient cannot set a workflow config
#     name yet, so it cannot address class "interop" / instance "default".
#   - java is excluded as a source (its debouncer still uses the old internal
#     workflow design) but participates as a target like any other runtime.
DEBOUNCE_SOURCES = ["python", "go"]
DEBOUNCE_PAIRS = [(s, t) for s in DEBOUNCE_SOURCES for t in PORTS if s != t]


@pytest.mark.parametrize("source,target", DEBOUNCE_PAIRS, ids=[f"{s}To{t.title()}" for s, t in DEBOUNCE_PAIRS])
def test_cross_language_debounce(interop_apps, source: str, target: str):
    """The source's client debouncer debounces the target's echoWorkflow twice
    with one key: both calls must coalesce on a single workflow (the debounced
    enqueue is shared DB state), and the run must use the latest input — the
    first call submits a payload with "stale-input" as the text, so the echoed
    "hello-interop" proves the second payload won."""
    final = TARGET_PAYLOADS[target]
    first = json.loads(json.dumps(final).replace("hello-interop", "stale-input"))
    url = f"http://localhost:{PORTS[source]}/debounce/{target}"
    resp = requests.post(url, json={"first": first, "final": final}, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    assert body["coalesced"] is True, (
        f"{source} -> {target}: the two debounce calls did not coalesce on one workflow"
    )
    assert body["result"] == EXPECTED, (
        f"{source} -> {target}: expected {EXPECTED}, got {body['result']}"
    )
