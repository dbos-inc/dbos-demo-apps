package main

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/dbos-inc/dbos-transact-go/dbos"
	"github.com/sirupsen/logrus"
)

func checkoutWorkflow(ctx dbos.DBOSContext, _ string) (string, error) {
	workflowID, err := ctx.GetWorkflowID()
	if err != nil {
		logger.WithError(err).Error("workflow ID retrieval failed")
		return "", err
	}

	// Create a new order
	orderID, err := dbos.RunAsStep(ctx, "createOrder", func(ctx context.Context, input string) (int, error) {
		return createOrder(ctx, db, input)
	}, "")
	if err != nil {
		logger.WithError(err).WithField("wf_id", workflowID).Error("order creation failed")
		return "", err
	}

	// Attempt to reserve inventory, cancelling the order if no inventory remains
	success, err := dbos.RunAsStep(ctx, "reserveInventory", func(ctx context.Context, input string) (bool, error) {
		return reserveInventory(ctx, db, input)
	}, "")
	if err != nil || !success {
		logger.WithField("order", orderID).Warn("no inventory")
		dbos.RunAsStep(ctx, "updateOrderStatus", func(ctx context.Context, input UpdateOrderStatusInput) (string, error) {
			return updateOrderStatus(ctx, db, input)
		}, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: CANCELLED})
		err = dbos.SetEvent(ctx, dbos.WorkflowSetEventInputGeneric[string]{Key: workflowID, Message: ""})
		return "", err
	}

	err = dbos.SetEvent(ctx, dbos.WorkflowSetEventInputGeneric[string]{Key: PAYMENT_ID, Message: workflowID})
	if err != nil {
		logger.WithError(err).WithFields(logrus.Fields{"order": orderID, "payment": workflowID}).Error("payment event creation failed")
		return "", err
	}

	payment_status, err := dbos.Recv[string](ctx, dbos.WorkflowRecvInput{Topic: PAYMENT_STATUS, Timeout: 60 * time.Second})
	if err != nil || payment_status != "paid" {
		logger.WithFields(logrus.Fields{"order": orderID, "payment": workflowID, "status": payment_status}).Warn("payment failed")
		dbos.RunAsStep(ctx, "undoReserveInventory", func(ctx context.Context, input string) (string, error) {
			return undoReserveInventory(ctx, db, input)
		}, "")
		dbos.RunAsStep(ctx, "updateOrderStatus", func(ctx context.Context, input UpdateOrderStatusInput) (string, error) {
			fmt.Println("input", input)
			return updateOrderStatus(ctx, db, input)
		}, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: CANCELLED})
	} else {
		logger.WithFields(logrus.Fields{"order": orderID, "payment": workflowID}).Info("payment success")
		dbos.RunAsStep(ctx, "updateOrderStatus", func(ctx context.Context, input UpdateOrderStatusInput) (string, error) {
			return updateOrderStatus(ctx, db, input)
		}, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: PAID})
		fmt.Println("calling dispatchOrderWorkflow")
		dbos.RunAsWorkflow(ctx, "dispatchOrderWorkflow", dispatchOrderWorkflow, orderID)
	}

	err = dbos.SetEvent(ctx, dbos.WorkflowSetEventInputGeneric[string]{Key: ORDER_ID, Message: strconv.Itoa(orderID)})
	if err != nil {
		logger.WithError(err).WithField("order", orderID).Error("order event creation failed")
		return "", err
	}
	return "", nil
}

func dispatchOrderWorkflow(ctx dbos.DBOSContext, orderID int) (string, error) {
	for range 10 {
		_, err := ctx.Sleep(time.Second)
		if err != nil {
			logger.WithError(err).WithField("order", orderID).Error("dispatch delay failed")
			return "", err
		}
		_, err = dbos.RunAsStep(ctx, "updateOrderProgress", func(ctx context.Context, orderID int) (int, error) {
			return updateOrderProgress(ctx, db, orderID)
		}, orderID)
		if err != nil {
			logger.WithError(err).WithField("order", orderID).Error("progress tracking failed")
			return "", err
		}
	}
	return "", nil
}
