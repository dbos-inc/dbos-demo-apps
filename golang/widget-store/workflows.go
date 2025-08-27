package main

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

func checkoutWorkflow(ctx dbos.DBOSContext, _ string) (string, error) {
	workflowID, err := ctx.GetWorkflowID()
	if err != nil {
		logger.Error("workflow ID retrieval failed", "error", err)
		return "", err
	}

	// Create a new order
	orderID, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (int, error) {
		return createOrder(stepCtx)
	})
	if err != nil {
		logger.Error("order creation failed", "error", err, "wf_id", workflowID)
		return "", err
	}

	// Attempt to reserve inventory, cancelling the order if no inventory remains
	success, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (bool, error) {
		return reserveInventory(stepCtx)
	})
	if err != nil || !success {
		logger.Warn("no inventory", "order", orderID)
		dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
			return updateOrderStatus(stepCtx, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: CANCELLED})
		})
		err = dbos.SetEvent(ctx, PAYMENT_ID, "")
		return "", err
	}

	err = dbos.SetEvent(ctx, PAYMENT_ID, workflowID)
	if err != nil {
		logger.Error("payment event creation failed", "error", err, "order", orderID, "payment", workflowID)
		return "", err
	}

	payment_status, err := dbos.Recv[string](ctx, PAYMENT_STATUS, 60*time.Second)
	if err != nil || payment_status != "paid" {
		logger.Warn("payment failed", "order", orderID, "payment", workflowID, "status", payment_status)
		dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
			return undoReserveInventory(stepCtx)
		})
		dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
			return updateOrderStatus(stepCtx, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: CANCELLED})
		})
	} else {
		logger.Info("payment success", "order", orderID, "payment", workflowID)
		dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
			return updateOrderStatus(stepCtx, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: PAID})
		})
		fmt.Println("calling dispatchOrderWorkflow")
		dbos.RunWorkflow(ctx, dispatchOrderWorkflow, orderID)
	}

	err = dbos.SetEvent(ctx, ORDER_ID, strconv.Itoa(orderID))
	if err != nil {
		logger.Error("order event creation failed", "error", err, "order", orderID)
		return "", err
	}
	return "", nil
}

func dispatchOrderWorkflow(ctx dbos.DBOSContext, orderID int) (string, error) {
	fmt.Println("Dispatching order", orderID)
	for range 10 {
		_, err := dbos.Sleep(ctx, time.Second)
		if err != nil {
			logger.Error("dispatch delay failed", "error", err, "order", orderID)
			return "", err
		}
		_, err = dbos.RunAsStep(ctx, func(stepCtx context.Context) (int, error) {
			return updateOrderProgress(stepCtx, orderID)
		})
		if err != nil {
			logger.Error("progress tracking failed", "error", err, "order", orderID)
			return "", err
		}
	}
	return "", nil
}
