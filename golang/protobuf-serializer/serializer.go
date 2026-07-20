package main

import (
	"encoding/base64"
	"fmt"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/anypb"
	"google.golang.org/protobuf/types/known/wrapperspb"
)

const nilMarker = "__DBOS_NIL"

// ProtoSerializer implements dbos.Serializer[any] using protobuf with anypb.Any as the type envelope.
// It can serialize any proto.Message type, embedding the type URL so Decode can reconstruct
// the concrete type without knowing it at compile time.
//
// DBOS also routes engine-internal step outputs through the configured serializer
// (e.g. the int64 deadline of a durable sleep, the empty-string output of a stream
// write), so bare Go scalars are wrapped in protobuf well-known wrapper types.
// Decode unwraps them back to native scalars, which DBOS type-asserts to the
// step's concrete type.
type ProtoSerializer struct{}

func (s *ProtoSerializer) Name() string { return "PROTO" }

// wrapScalar wraps a bare Go scalar in its protobuf well-known wrapper type.
// Only exact round-trippable types are supported: Decode returns the same Go
// type that was encoded.
func wrapScalar(data any) (proto.Message, bool) {
	switch v := data.(type) {
	case bool:
		return wrapperspb.Bool(v), true
	case int32:
		return wrapperspb.Int32(v), true
	case int64:
		return wrapperspb.Int64(v), true
	case uint32:
		return wrapperspb.UInt32(v), true
	case uint64:
		return wrapperspb.UInt64(v), true
	case float32:
		return wrapperspb.Float(v), true
	case float64:
		return wrapperspb.Double(v), true
	case string:
		return wrapperspb.String(v), true
	case []byte:
		return wrapperspb.Bytes(v), true
	}
	return nil, false
}

// unwrapScalar reverses wrapScalar, returning the native Go scalar for
// well-known wrapper messages and the message unchanged otherwise.
func unwrapScalar(msg proto.Message) any {
	switch v := msg.(type) {
	case *wrapperspb.BoolValue:
		return v.Value
	case *wrapperspb.Int32Value:
		return v.Value
	case *wrapperspb.Int64Value:
		return v.Value
	case *wrapperspb.UInt32Value:
		return v.Value
	case *wrapperspb.UInt64Value:
		return v.Value
	case *wrapperspb.FloatValue:
		return v.Value
	case *wrapperspb.DoubleValue:
		return v.Value
	case *wrapperspb.StringValue:
		return v.Value
	case *wrapperspb.BytesValue:
		return v.Value
	}
	return msg
}

func (s *ProtoSerializer) Encode(data any) (*string, error) {
	if data == nil {
		marker := nilMarker
		return &marker, nil
	}

	msg, ok := data.(proto.Message)
	if !ok {
		if msg, ok = wrapScalar(data); !ok {
			return nil, fmt.Errorf("proto serializer: expected proto.Message or scalar, got %T", data)
		}
	}

	anyMsg, err := anypb.New(msg)
	if err != nil {
		return nil, fmt.Errorf("proto serializer: anypb.New failed: %w", err)
	}

	bytes, err := proto.Marshal(anyMsg)
	if err != nil {
		return nil, fmt.Errorf("proto serializer: marshal failed: %w", err)
	}

	encoded := base64.StdEncoding.EncodeToString(bytes)
	return &encoded, nil
}

func (s *ProtoSerializer) Decode(data *string) (any, error) {
	if data == nil || *data == nilMarker {
		return nil, nil
	}

	raw, err := base64.StdEncoding.DecodeString(*data)
	if err != nil {
		return nil, fmt.Errorf("proto serializer: base64 decode failed: %w", err)
	}

	var anyMsg anypb.Any
	if err := proto.Unmarshal(raw, &anyMsg); err != nil {
		return nil, fmt.Errorf("proto serializer: unmarshal Any failed: %w", err)
	}

	msg, err := anyMsg.UnmarshalNew()
	if err != nil {
		return nil, fmt.Errorf("proto serializer: UnmarshalNew failed: %w", err)
	}

	return unwrapScalar(msg), nil
}
