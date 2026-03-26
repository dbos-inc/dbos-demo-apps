package main

import (
	"context"
	"fmt"
	"os"
	"time"

	dbos "github.com/dbos-inc/dbos-transact-golang/dbos"
	pb "protobuf-serializer/pb"
)

var processTask = dbos.Workflow[*pb.Task, *pb.TaskResult](ProcessTask)

func ProcessTask(ctx dbos.DBOSContext, task *pb.Task) (*pb.TaskResult, error) {
	return dbos.RunAsStep(ctx, func(_ context.Context) (*pb.TaskResult, error) {
		return &pb.TaskResult{
			TaskId:  task.Id,
			Success: true,
			Message: fmt.Sprintf("Processed task: %s", task.Title),
			OutputMetadata: map[string]string{
				"processed_by": "dbos",
				"priority":     task.Priority.String(),
			},
		}, nil
	})
}

func main() {
	dbosCtx, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
		DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
		AppName:     "protobuf-serializer-demo",
		Serializer:  &ProtoSerializer{},
	})
	if err != nil {
		panic(err)
	}

	dbos.RegisterWorkflow(dbosCtx, processTask)

	err = dbosCtx.Launch()
	if err != nil {
		panic(err)
	}
	defer dbosCtx.Shutdown(10 * time.Second)

	task := &pb.Task{
		Id:          "task-1",
		Title:       "Demo Task",
		Description: "A demo task using protobuf serialization",
		Priority:    pb.Priority_HIGH,
		Tags:        []string{"demo", "protobuf"},
		Metadata:    map[string]string{"source": "cli"},
	}

	handle, err := dbos.RunWorkflow(dbosCtx, processTask, task)
	if err != nil {
		panic(err)
	}

	result, err := handle.GetResult()
	if err != nil {
		panic(err)
	}

	fmt.Printf("Task ID: %s\n", result.TaskId)
	fmt.Printf("Success: %v\n", result.Success)
	fmt.Printf("Message: %s\n", result.Message)
	fmt.Printf("Metadata: %v\n", result.OutputMetadata)
}
