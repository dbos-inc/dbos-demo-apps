package main

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sirupsen/logrus"

	"widget-store/mocks"

	"github.com/stretchr/testify/mock"
)

func TestCheckoutWorkflow(t *testing.T) {
	testDatabaseURL := "postgres://postgres:dbos@localhost:5432/widget_store_test"
	d, err := pgxpool.New(context.Background(), testDatabaseURL)
	if err != nil {
		logger.WithError(err).Fatal("database connection failed")
	}
	db = d
	defer db.Close()

	logger = logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339,
	})
	logger.SetLevel(logrus.InfoLevel)

	dbosContextMock := mocks.NewMockDBOSContext(t)

	// Test running the wrapped workflow
	t.Run("Payment fails", func(t *testing.T) {
		wfID := "test-workflow-id"

		// Set expectations on what DBOS stuff that happens within the workflow
		dbosContextMock.On("GetWorkflowID").Return(wfID, nil)
		dbosContextMock.On("RunAsStep", mock.Anything, "createOrder", mock.Anything, "").Return(1, nil).Once()
		dbosContextMock.On("RunAsStep", mock.Anything, "reserveInventory", mock.Anything, "").Return(true, nil).Once()
		dbosContextMock.On("SetEvent", mock.Anything, mock.Anything).Return(nil).Once()
		dbosContextMock.On("Recv", mock.Anything, mock.Anything).Return("failed", nil).Once()
		dbosContextMock.On("RunAsStep", mock.Anything, "undoReserveInventory", mock.Anything, "").Return("", nil).Once()
		dbosContextMock.On("RunAsStep", mock.Anything, "updateOrderStatus", mock.Anything, UpdateOrderStatusInput{OrderID: 1, OrderStatus: CANCELLED}).Return("", nil).Once()
		dbosContextMock.On("SetEvent", mock.Anything, mock.Anything).Return(nil).Once()

		res, err := checkoutWorkflow(dbosContextMock, "")
		if err != nil {
			t.Fatalf("checkout workflow failed: %v", err)
		}
		if res != "" {
			t.Fatalf("expected empty result, got %s", res)
		}

		dbosContextMock.AssertExpectations(t)
	})
}
