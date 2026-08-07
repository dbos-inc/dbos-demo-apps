# Protobuf serializer (Rust / durare)

Plug a custom serializer into [`durare`](https://crates.io/crates/durare) so
workflow inputs, outputs, and events are stored as **protobuf bytes** instead
of JSON — a port of the Go `protobuf-serializer` demo. It registers one
workflow, runs a task through it, and prints the result; the interesting part
is what lands in the database.

## Run it

```bash
createdb durare_proto   # once
DBOS_SYSTEM_DATABASE_URL=postgres://localhost:5432/durare_proto cargo run
```

```
Task ID: task-1
Success: true
Message: Processed task: Demo Task
Metadata: {"priority": "HIGH", "processed_by": "durare"}
```

Then look at the stored row:

```bash
psql durare_proto -c \
  "SELECT name, serialization, left(inputs, 40) FROM dbos.workflow_status"
```

The `serialization` tag is `PROTO_VALUE` and the payload columns are
base64-encoded protobuf, not JSON.

## How it works

`ProtoSerializer` implements durare's [`SerializerCodec`] trait (`name` /
`encode` / `decode`) and is installed with
`PostgresProvider::connect(url).with_serializer(Serializer::custom(...))`.
Each value is encoded as a standard `google.protobuf.Value` message via
`prost-types`, so any protobuf toolchain can decode the rows with the
well-known `Value` type. The message shapes (`proto/task.proto`) are mirrored
as plain serde structs — no `protoc` build step.

[`SerializerCodec`]: https://docs.rs/durare/latest/durare/trait.SerializerCodec.html

## Value-level vs. type-level (a difference from Go)

durare's serializer seam is **value-level**: workflow I/O passes through serde
to a JSON value, and the codec chooses the stored representation of that
value. Go's seam is **type-level** (`Encode(data any)`): its demo marshals the
concrete generated message and wraps it in an `anypb.Any`, preserving the
protobuf type identity on the wire.

The two formats are not wire-compatible, so this codec deliberately uses its
own format tag (`PROTO_VALUE`, not Go's `PROTO`) — decoding is routed by tag,
and a shared database must route each row to the serializer that wrote it.
Numbers ride `google.protobuf.Value` doubles; integers beyond 2⁵³ should be
string-encoded, as durare's `determinism` guide already prescribes.
