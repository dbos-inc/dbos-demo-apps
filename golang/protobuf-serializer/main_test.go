package main

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	dbos "github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"

	pb "protobuf-serializer/pb"
)

var senderWorkflow = dbos.Workflow[*pb.Task, *pb.Task](func(ctx dbos.DBOSContext, task *pb.Task) (*pb.Task, error) {
	wfID, err := dbos.GetWorkflowID(ctx)
	if err != nil {
		return nil, err
	}
	destID := wfID + "-receiver"
	if err := dbos.Send(ctx, destID, task, "test-topic"); err != nil {
		return nil, err
	}
	return task, nil
})

var receiverWorkflow = dbos.Workflow[*pb.Task, *pb.Task](func(ctx dbos.DBOSContext, _ *pb.Task) (*pb.Task, error) {
	received, err := dbos.Recv[*pb.Task](ctx, "test-topic", 10*time.Second)
	if err != nil {
		return nil, err
	}
	return received, nil
})

var setEventWorkflow = dbos.Workflow[*pb.Task, *pb.Task](func(ctx dbos.DBOSContext, task *pb.Task) (*pb.Task, error) {
	if err := dbos.SetEvent(ctx, "test-key", task); err != nil {
		return nil, err
	}
	return task, nil
})

var getEventWorkflow = dbos.Workflow[*pb.WorkflowRef, *pb.Task](func(ctx dbos.DBOSContext, ref *pb.WorkflowRef) (*pb.Task, error) {
	event, err := dbos.GetEvent[*pb.Task](ctx, ref.WorkflowId, "test-key", 10*time.Second)
	if err != nil {
		return nil, err
	}
	return event, nil
})

func setupTest(t *testing.T) dbos.DBOSContext {
	t.Helper()

	databaseURL := os.Getenv("DBOS_SYSTEM_DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://postgres:dbos@localhost:5432/dbos_testing?sslmode=disable"
	}

	// Drop and recreate the database so tests are idempotent
	parsedURL, err := pgx.ParseConfig(databaseURL)
	require.NoError(t, err)
	dbName := parsedURL.Database
	postgresURL := parsedURL.Copy()
	postgresURL.Database = "postgres"
	conn, err := pgx.ConnectConfig(context.Background(), postgresURL)
	require.NoError(t, err)
	_, err = conn.Exec(context.Background(), fmt.Sprintf("DROP DATABASE IF EXISTS %s", dbName))
	require.NoError(t, err)
	conn.Close(context.Background())

	dbosCtx, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
		DatabaseURL: databaseURL,
		AppName:     "proto-test",
		Serializer:  &ProtoSerializer{},
	})
	require.NoError(t, err)

	dbos.RegisterWorkflow(dbosCtx, processTask)
	dbos.RegisterWorkflow(dbosCtx, senderWorkflow)
	dbos.RegisterWorkflow(dbosCtx, receiverWorkflow)
	dbos.RegisterWorkflow(dbosCtx, setEventWorkflow)
	dbos.RegisterWorkflow(dbosCtx, getEventWorkflow)

	err = dbosCtx.Launch()
	require.NoError(t, err)

	t.Cleanup(func() {
		dbosCtx.Shutdown(10 * time.Second)
	})

	return dbosCtx
}

func sampleTask() *pb.Task {
	return &pb.Task{
		Id:          "task-1",
		Title:       "Test Task",
		Description: "A test task for protobuf serialization",
		Priority:    pb.Priority_HIGH,
		Tags:        []string{"test", "protobuf"},
		Metadata:    map[string]string{"env": "test"},
	}
}

func TestProtobuf(t *testing.T) {
	executor := setupTest(t)

	t.Run("WorkflowExecution", func(t *testing.T) {
		task := sampleTask()
		handle, err := dbos.RunWorkflow(executor, processTask, task, dbos.WithWorkflowID("proto-exec-wf"))
		require.NoError(t, err)

		result, err := handle.GetResult()
		require.NoError(t, err)
		assert.Equal(t, task.Id, result.TaskId)
		assert.True(t, result.Success)
		assert.Equal(t, fmt.Sprintf("Processed task: %s", task.Title), result.Message)
		assert.Equal(t, "dbos", result.OutputMetadata["processed_by"])
		assert.Equal(t, task.Priority.String(), result.OutputMetadata["priority"])
	})

	t.Run("RetrieveWorkflow", func(t *testing.T) {
		task := sampleTask()
		handle, err := dbos.RunWorkflow(executor, processTask, task, dbos.WithWorkflowID("proto-retrieve-wf"))
		require.NoError(t, err)

		origResult, err := handle.GetResult()
		require.NoError(t, err)

		retrieved, err := dbos.RetrieveWorkflow[*pb.TaskResult](executor, "proto-retrieve-wf")
		require.NoError(t, err)

		retrievedResult, err := retrieved.GetResult()
		require.NoError(t, err)
		assert.True(t, proto.Equal(origResult, retrievedResult))
	})

	t.Run("GetWorkflowSteps", func(t *testing.T) {
		task := sampleTask()
		handle, err := dbos.RunWorkflow(executor, processTask, task, dbos.WithWorkflowID("proto-steps-wf"))
		require.NoError(t, err)

		_, err = handle.GetResult()
		require.NoError(t, err)

		steps, err := dbos.GetWorkflowSteps(executor, "proto-steps-wf")
		require.NoError(t, err)
		require.NotEmpty(t, steps)

		stepOutput, ok := steps[0].Output.(*pb.TaskResult)
		require.True(t, ok, "step output should be *pb.TaskResult, got %T", steps[0].Output)
		assert.Equal(t, task.Id, stepOutput.TaskId)
		assert.True(t, stepOutput.Success)
	})

	t.Run("ListWorkflows", func(t *testing.T) {
		task := sampleTask()
		handle, err := dbos.RunWorkflow(executor, processTask, task, dbos.WithWorkflowID("proto-list-wf"))
		require.NoError(t, err)

		_, err = handle.GetResult()
		require.NoError(t, err)

		workflows, err := dbos.ListWorkflows(executor,
			dbos.WithWorkflowIDs([]string{"proto-list-wf"}),
			dbos.WithLoadInput(true),
			dbos.WithLoadOutput(true),
		)
		require.NoError(t, err)
		require.Len(t, workflows, 1)

		wf := workflows[0]
		input, ok := wf.Input.(*pb.Task)
		require.True(t, ok, "workflow input should be *pb.Task, got %T", wf.Input)
		assert.True(t, proto.Equal(task, input))

		output, ok := wf.Output.(*pb.TaskResult)
		require.True(t, ok, "workflow output should be *pb.TaskResult, got %T", wf.Output)
		assert.Equal(t, task.Id, output.TaskId)
	})

	t.Run("SendRecv", func(t *testing.T) {
		task := sampleTask()

		// Start receiver first with a known ID
		receiverHandle, err := dbos.RunWorkflow(executor, receiverWorkflow, task, dbos.WithWorkflowID("proto-sendrecv-wf-receiver"))
		require.NoError(t, err)

		// Start sender — it sends to "<its-own-id>-receiver"
		_, err = dbos.RunWorkflow(executor, senderWorkflow, task, dbos.WithWorkflowID("proto-sendrecv-wf"))
		require.NoError(t, err)

		received, err := receiverHandle.GetResult()
		require.NoError(t, err)
		assert.True(t, proto.Equal(task, received))
	})

	t.Run("SetGetEvent", func(t *testing.T) {
		task := sampleTask()

		setHandle, err := dbos.RunWorkflow(executor, setEventWorkflow, task, dbos.WithWorkflowID("proto-setevent-wf"))
		require.NoError(t, err)

		_, err = setHandle.GetResult()
		require.NoError(t, err)

		ref := &pb.WorkflowRef{WorkflowId: "proto-setevent-wf"}
		getHandle, err := dbos.RunWorkflow(executor, getEventWorkflow, ref, dbos.WithWorkflowID("proto-getevent-wf"))
		require.NoError(t, err)

		got, err := getHandle.GetResult()
		require.NoError(t, err)
		assert.True(t, proto.Equal(task, got))
	})
}
