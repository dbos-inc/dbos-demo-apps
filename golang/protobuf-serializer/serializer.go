package main

import (
	"encoding/base64"
	"fmt"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/anypb"
)

const nilMarker = "__DBOS_NIL"

// ProtoSerializer implements dbos.Serializer[any] using protobuf with anypb.Any as the type envelope.
// It can serialize any proto.Message type, embedding the type URL so Decode can reconstruct
// the concrete type without knowing it at compile time.
type ProtoSerializer struct{}

func (s *ProtoSerializer) Name() string { return "PROTO" }

func (s *ProtoSerializer) Encode(data any) (*string, error) {
	if data == nil {
		marker := nilMarker
		return &marker, nil
	}

	msg, ok := data.(proto.Message)
	if !ok {
		return nil, fmt.Errorf("proto serializer: expected proto.Message, got %T", data)
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

	return msg, nil
}
