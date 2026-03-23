package com.example.demo.service;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.workflow.Workflow;

import java.time.Duration;

import com.example.demo.repository.WidgetStoreRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class WidgetStoreServiceImpl implements WidgetStoreService {
  private static final Logger logger = LoggerFactory.getLogger(WidgetStoreServiceImpl.class);

  private final DBOS dbos;
  private final WidgetStoreRepository repo;
  private WidgetStoreService self;

  public WidgetStoreServiceImpl(DBOS dbos, WidgetStoreRepository widgetStoreRepo) {
    this.dbos = dbos;
    this.repo = widgetStoreRepo;
  }

  public void setSelf(WidgetStoreService self) {
    this.self = self;
  }

  @Workflow
  @Override
  public void checkoutWorkflow() {

    try {
      dbos.runStep(() -> repo.subtractInventory(), "subtractInventory");
    } catch (RuntimeException e) {
      logger.error("Failed to reserve inventory for workflow {}", DBOS.workflowId());
      dbos.setEvent(PAYMENT_ID, null);
      return;
    }

    var orderId = dbos.runStep(() -> repo.createOrder(), "createOrder");

    dbos.setEvent(PAYMENT_ID, DBOS.workflowId());
    var payment_status = (String) dbos.recv(PAYMENT_STATUS, Duration.ofSeconds(120));

    if (payment_status != null && payment_status.equals("paid")) {
      logger.info("Payment successful for order {}", orderId);
      dbos.runStep(() -> repo.markOrderPaid(orderId), "markOrderPaid");
      dbos.startWorkflow(() -> self.dispatchOrderWorkflow(orderId));
    } else {
      logger.info("Payment failed for order {}", orderId);
      dbos.runStep(() -> repo.errorOrder(orderId), "errorOrder");
      dbos.runStep(() -> repo.undoSubtractInventory(), "undoSubtractInventory");
    }

    dbos.setEvent(ORDER_ID, String.valueOf(orderId));
  }

  @Workflow
  @Override
  public void dispatchOrderWorkflow(Integer orderId) {
    for (int i = 0; i < 10; i++) {
      dbos.sleep(Duration.ofSeconds(1));
      dbos.runStep(() -> repo.updateOrderProgress(orderId), "updateOrderProgress");
    }
  }
}
