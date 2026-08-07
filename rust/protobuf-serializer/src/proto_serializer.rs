//! A custom [`SerializerCodec`] that stores workflow data as protobuf.
//!
//! durare's serializer seam is *value-level*: workflow inputs and outputs are
//! first converted to JSON values via serde, and the codec chooses how those
//! values are stored. This codec encodes each value as a standard
//! `google.protobuf.Value` message (via `prost-types`), so every row in the
//! DBOS tables holds protobuf bytes (base64-encoded into the TEXT column)
//! that any protobuf toolchain can decode with the well-known `Value` type.
//!
//! This differs from the Go demo's serializer, which is *type-level*
//! (`Encode(data any)`) and wraps the concrete generated message in an
//! `anypb.Any`. The two formats are not wire-compatible, so this codec uses
//! its own format tag — a shared database routes each row to the serializer
//! that wrote it.

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use durare::{Error, Result, SerializerCodec};
use prost::Message;
use prost_types::value::Kind;
use prost_types::{ListValue, Struct, Value as ProtoValue};
use serde_json::Value as JsonValue;

pub struct ProtoSerializer;

impl SerializerCodec for ProtoSerializer {
    fn name(&self) -> &str {
        // Deliberately not Go's "PROTO": the envelope differs
        // (google.protobuf.Value here vs. anypb.Any of the concrete type), and
        // decoding is routed by this tag.
        "PROTO_VALUE"
    }

    fn encode(&self, value: &JsonValue) -> Result<String> {
        let proto = json_to_proto(value);
        Ok(STANDARD.encode(proto.encode_to_vec()))
    }

    fn decode(&self, stored: &str) -> Result<JsonValue> {
        let bytes = STANDARD
            .decode(stored)
            .map_err(|e| Error::app(format!("PROTO_VALUE: invalid base64: {e}")))?;
        let proto = ProtoValue::decode(bytes.as_slice())
            .map_err(|e| Error::app(format!("PROTO_VALUE: invalid protobuf: {e}")))?;
        proto_to_json(&proto)
    }
}

fn json_to_proto(value: &JsonValue) -> ProtoValue {
    let kind = match value {
        JsonValue::Null => Kind::NullValue(0),
        JsonValue::Bool(b) => Kind::BoolValue(*b),
        // google.protobuf.Value numbers are doubles; integers beyond 2^53
        // would lose precision here — durare's determinism guide already
        // prescribes string-encoding such values.
        JsonValue::Number(n) => Kind::NumberValue(n.as_f64().unwrap_or(f64::NAN)),
        JsonValue::String(s) => Kind::StringValue(s.clone()),
        JsonValue::Array(items) => Kind::ListValue(ListValue {
            values: items.iter().map(json_to_proto).collect(),
        }),
        JsonValue::Object(map) => Kind::StructValue(Struct {
            fields: map
                .iter()
                .map(|(k, v)| (k.clone(), json_to_proto(v)))
                .collect(),
        }),
    };
    ProtoValue { kind: Some(kind) }
}

fn proto_to_json(value: &ProtoValue) -> Result<JsonValue> {
    Ok(match &value.kind {
        None | Some(Kind::NullValue(_)) => JsonValue::Null,
        Some(Kind::BoolValue(b)) => JsonValue::Bool(*b),
        Some(Kind::NumberValue(n)) => serde_json::Number::from_f64(*n)
            .map(JsonValue::Number)
            .ok_or_else(|| Error::app("PROTO_VALUE: non-finite number"))?,
        Some(Kind::StringValue(s)) => JsonValue::String(s.clone()),
        Some(Kind::ListValue(list)) => JsonValue::Array(
            list.values
                .iter()
                .map(proto_to_json)
                .collect::<Result<Vec<_>>>()?,
        ),
        Some(Kind::StructValue(st)) => JsonValue::Object(
            st.fields
                .iter()
                .map(|(k, v)| proto_to_json(v).map(|j| (k.clone(), j)))
                .collect::<Result<serde_json::Map<_, _>>>()?,
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trips_a_task_shaped_value() {
        let codec = ProtoSerializer;
        let value = json!({
            "id": "task-1",
            "title": "Demo Task",
            "priority": "HIGH",
            "tags": ["demo", "protobuf"],
            "metadata": {"source": "cli"},
            "success": true,
            "score": 99.5,
            "nothing": null,
        });
        let stored = codec.encode(&value).unwrap();
        // The stored form is base64 protobuf, not JSON.
        assert!(!stored.contains("task-1"));
        assert_eq!(codec.decode(&stored).unwrap(), value);
    }
}
