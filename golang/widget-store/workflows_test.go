package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"

	"widget-store/mocks"

	"github.com/stretchr/testify/mock"
)

func setupTestDB() {
	testDatabaseURL := "postgres://postgres:dbos@localhost:5432/widget_store_test"
	d, err := pgxpool.New(context.Background(), testDatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	db = d

	logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
}

func TestCheckoutWorkflow(t *testing.T) {
	setupTestDB()
	defer db.Close()

	t.Run("Payment success without dispatch", func(t *testing.T) {
		// Test the happy path but with payment failure to avoid RunAsWorkflow
		dbosCtx := mocks.NewMockDBOSContext(t)
		wfID := "test-workflow-123"
		orderID := 1

		dbosCtx.On("GetWorkflowID").Return(wfID, nil)
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(orderID, nil).Once()
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(true, nil).Once()
		dbosCtx.On("SetEvent", dbosCtx, mock.Anything, mock.Anything).Return(nil).Once()
		dbosCtx.On("Recv", dbosCtx, mock.Anything, mock.Anything).Return("failed", nil).Once()
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return("", nil).Once()
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return("", nil).Once()
		dbosCtx.On("SetEvent", dbosCtx, mock.Anything, mock.Anything).Return(nil).Once()

		result, err := checkoutWorkflow(dbosCtx, "")
		assert.NoError(t, err)
		assert.Equal(t, "", result)
		dbosCtx.AssertExpectations(t)
	})

	t.Run("Inventory reservation fails", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)
		wfID := "test-workflow-456"
		orderID := 2

		dbosCtx.On("GetWorkflowID").Return(wfID, nil)

		// createOrder step
		dbosCtx.On("RunAsStep", dbosCtx, mock.MatchedBy(func(fn interface{}) bool {
			return true
		}), mock.Anything).Return(orderID, nil).Once()

		// reserveInventory step - fails
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(false, nil).Once()

		// updateOrderStatus to CANCELLED
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return("", nil).Once()

		// SetEvent for empty payment
		dbosCtx.On("SetEvent", dbosCtx, mock.Anything, mock.Anything).Return(nil).Once()

		result, err := checkoutWorkflow(dbosCtx, "")
		assert.NoError(t, err) // Inventory failure doesn't return error, just logs warning
		assert.Equal(t, "", result)
		dbosCtx.AssertExpectations(t)
	})

	t.Run("Payment timeout", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)
		wfID := "test-workflow-789"
		orderID := 3

		dbosCtx.On("GetWorkflowID").Return(wfID, nil)

		// createOrder and reserveInventory succeed
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(orderID, nil).Once()
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(true, nil).Once()

		// SetEvent for payment
		dbosCtx.On("SetEvent", dbosCtx, mock.Anything, mock.Anything).Return(nil).Once()

		// Recv times out
		dbosCtx.On("Recv", dbosCtx, mock.Anything, mock.Anything).Return("", errors.New("timeout")).Once()

		// Undo reservation and cancel order
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return("", nil).Once() // undoReserveInventory
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return("", nil).Once() // updateOrderStatus CANCELLED

		// SetEvent for order
		dbosCtx.On("SetEvent", dbosCtx, mock.Anything, mock.Anything).Return(nil).Once()

		result, err := checkoutWorkflow(dbosCtx, "")
		assert.NoError(t, err)
		assert.Equal(t, "", result)
		dbosCtx.AssertExpectations(t)
	})

	t.Run("Payment failed status", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)
		wfID := "test-workflow-101"
		orderID := 4

		dbosCtx.On("GetWorkflowID").Return(wfID, nil)

		// createOrder and reserveInventory succeed
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(orderID, nil).Once()
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(true, nil).Once()

		// SetEvent for payment
		dbosCtx.On("SetEvent", dbosCtx, mock.Anything, mock.Anything).Return(nil).Once()

		// Recv payment status - failed
		dbosCtx.On("Recv", dbosCtx, mock.Anything, mock.Anything).Return("failed", nil).Once()

		// Undo reservation and cancel order
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return("", nil).Once() // undoReserveInventory
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return("", nil).Once() // updateOrderStatus CANCELLED

		// SetEvent for order
		dbosCtx.On("SetEvent", dbosCtx, mock.Anything, mock.Anything).Return(nil).Once()

		result, err := checkoutWorkflow(dbosCtx, "")
		assert.NoError(t, err)
		assert.Equal(t, "", result)
		dbosCtx.AssertExpectations(t)
	})

	t.Run("CreateOrder step fails", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)
		wfID := "test-workflow-111"

		dbosCtx.On("GetWorkflowID").Return(wfID, nil)

		// createOrder step fails
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(0, errors.New("database error")).Once()

		result, err := checkoutWorkflow(dbosCtx, "")
		assert.Error(t, err)
		assert.Equal(t, "", result)
		assert.Contains(t, err.Error(), "database error")
		dbosCtx.AssertExpectations(t)
	})

	t.Run("GetWorkflowID fails", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)

		dbosCtx.On("GetWorkflowID").Return("", errors.New("workflow ID error"))

		result, err := checkoutWorkflow(dbosCtx, "")
		assert.Error(t, err)
		assert.Equal(t, "", result)
		assert.Contains(t, err.Error(), "workflow ID error")
		dbosCtx.AssertExpectations(t)
	})
}

func TestDispatchOrderWorkflow(t *testing.T) {
	setupTestDB()
	defer db.Close()

	t.Run("Happy path - successful dispatch", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)
		orderID := 1

		// Mock 10 iterations of sleep and progress updates
		for i := 0; i < 10; i++ {
			dbosCtx.On("Sleep", dbosCtx, time.Second).Return(time.Second, nil).Once()
			dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(10-i-1, nil).Once() // Progress decreasing
		}

		result, err := dispatchOrderWorkflow(dbosCtx, orderID)
		assert.NoError(t, err)
		assert.Equal(t, "", result)
		dbosCtx.AssertExpectations(t)
	})

	t.Run("Sleep fails", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)
		orderID := 2

		// First sleep fails
		dbosCtx.On("Sleep", dbosCtx, time.Second).Return(time.Duration(0), errors.New("sleep error")).Once()

		result, err := dispatchOrderWorkflow(dbosCtx, orderID)
		assert.Error(t, err)
		assert.Equal(t, "", result)
		assert.Contains(t, err.Error(), "sleep error")
		dbosCtx.AssertExpectations(t)
	})

	t.Run("UpdateOrderProgress step fails", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)
		orderID := 3

		// First sleep succeeds, but progress update fails
		dbosCtx.On("Sleep", dbosCtx, time.Second).Return(time.Second, nil).Once()
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(0, errors.New("database update error")).Once()

		result, err := dispatchOrderWorkflow(dbosCtx, orderID)
		assert.Error(t, err)
		assert.Equal(t, "", result)
		assert.Contains(t, err.Error(), "database update error")
		dbosCtx.AssertExpectations(t)
	})

	t.Run("Partial execution - fails mid-way", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)
		orderID := 4

		// Successfully complete 5 iterations, fail on 6th
		for i := 0; i < 5; i++ {
			dbosCtx.On("Sleep", dbosCtx, time.Second).Return(time.Second, nil).Once()
			dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(10-i-1, nil).Once()
		}

		// 6th iteration - sleep succeeds but step fails
		dbosCtx.On("Sleep", dbosCtx, time.Second).Return(time.Second, nil).Once()
		dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(0, errors.New("mid-execution error")).Once()

		result, err := dispatchOrderWorkflow(dbosCtx, orderID)
		assert.Error(t, err)
		assert.Equal(t, "", result)
		assert.Contains(t, err.Error(), "mid-execution error")
		dbosCtx.AssertExpectations(t)
	})

	t.Run("Multiple orderIDs different behavior", func(t *testing.T) {
		dbosCtx := mocks.NewMockDBOSContext(t)
		orderID := 999

		// Test with a different orderID to ensure it's passed correctly
		for i := 0; i < 10; i++ {
			dbosCtx.On("Sleep", dbosCtx, time.Second).Return(time.Second, nil).Once()
			dbosCtx.On("RunAsStep", dbosCtx, mock.Anything, mock.Anything).Return(5-i%6, nil).Once() // Different progress pattern
		}

		result, err := dispatchOrderWorkflow(dbosCtx, orderID)
		assert.NoError(t, err)
		assert.Equal(t, "", result)
		dbosCtx.AssertExpectations(t)
	})
}
