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
	orderID, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (int, error) {
		return createOrder(stepCtx)
	})
	if err != nil {
		logger.WithError(err).WithField("wf_id", workflowID).Error("order creation failed")
		return "", err
	}

	// Attempt to reserve inventory, cancelling the order if no inventory remains
	success, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (bool, error) {
		return reserveInventory(stepCtx)
	})
	if err != nil || !success {
		logger.WithField("order", orderID).Warn("no inventory")
		dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
			return updateOrderStatus(stepCtx, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: CANCELLED})
		})
		err = dbos.SetEvent(ctx, dbos.WorkflowSetEventInputGeneric[string]{Key: PAYMENT_ID, Message: ""})
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
		dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
			return undoReserveInventory(stepCtx)
		})
		dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
			return updateOrderStatus(stepCtx, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: CANCELLED})
		})
	} else {
		logger.WithFields(logrus.Fields{"order": orderID, "payment": workflowID}).Info("payment success")
		dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
			return updateOrderStatus(stepCtx, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: PAID})
		})
		fmt.Println("calling dispatchOrderWorkflow")
		dbos.RunAsWorkflow(ctx, dispatchOrderWorkflow, orderID)
	}

	err = dbos.SetEvent(ctx, dbos.WorkflowSetEventInputGeneric[string]{Key: ORDER_ID, Message: strconv.Itoa(orderID)})
	if err != nil {
		logger.WithError(err).WithField("order", orderID).Error("order event creation failed")
		return "", err
	}
	return "", nil
}

func dispatchOrderWorkflow(ctx dbos.DBOSContext, orderID int) (string, error) {
	fmt.Println("Dispatching order", orderID)
	for range 10 {
		_, err := ctx.Sleep(time.Second)
		if err != nil {
			logger.WithError(err).WithField("order", orderID).Error("dispatch delay failed")
			return "", err
		}
		_, err = dbos.RunAsStep(ctx, func(stepCtx context.Context) (int, error) {
			return updateOrderProgress(stepCtx, orderID)
		})
		if err != nil {
			logger.WithError(err).WithField("order", orderID).Error("progress tracking failed")
			return "", err
		}
	}
	return "", nil
}
