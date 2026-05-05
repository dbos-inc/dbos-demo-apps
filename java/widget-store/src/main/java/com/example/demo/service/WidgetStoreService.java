package com.example.demo.service;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.workflow.Workflow;

import java.time.Duration;

import com.example.demo.repository.WidgetStoreRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

// Note, this class is automatically proxied and does not require an interface.
// The DBOS bean is constructor injected and the self bean is property injected.

@Service
public class WidgetStoreService {
  public static final String PAYMENT_STATUS = "payment_status";
  public static final String PAYMENT_ID = "payment_id";
  public static final String ORDER_ID = "order_id";

  private static final Logger logger = LoggerFactory.getLogger(WidgetStoreService.class);

  private final DBOS dbos;
  private final WidgetStoreRepository repo;
  private WidgetStoreService self;

  public WidgetStoreService(DBOS dbos, WidgetStoreRepository widgetStoreRepo) {
    this.dbos = dbos;
    this.repo = widgetStoreRepo;
  }

  @Autowired
  @Lazy
  public void setSelf(WidgetStoreService self) {
    this.self = self;
  }

  @Workflow
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
    var payment_status = dbos.<String>recv(PAYMENT_STATUS, Duration.ofSeconds(120));

    if (payment_status.map(ps -> ps.equals("paid")).orElse(false)) {
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
  public void dispatchOrderWorkflow(Integer orderId) {
    for (int i = 0; i < 10; i++) {
      dbos.sleep(Duration.ofSeconds(1));
      dbos.runStep(() -> repo.updateOrderProgress(orderId), "updateOrderProgress");
    }
  }
}
