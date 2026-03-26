.PHONY: proto

proto:
	protoc --go_out=. --go_opt=paths=source_relative proto/task.proto
	mv proto/task.pb.go pb/task.pb.go
