package com.example.widgetstore.service;

import java.time.Duration;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static com.example.widgetstore.constants.Constants.ORDER_ID;
import static com.example.widgetstore.constants.Constants.PAYMENT_ID;
import static com.example.widgetstore.constants.Constants.PAYMENT_STATUS;
import com.example.widgetstore.dto.OrderDto;
import com.example.widgetstore.dto.ProductDto;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.workflow.Workflow;

public class WidgetStoreServiceImpl implements WidgetStoreService {
    
    private static final Logger logger = LoggerFactory.getLogger(WidgetStoreServiceImpl.class);

    private final WidgetStoreRepository repository;
    private final TxStepProvider stepProvider;

    public WidgetStoreServiceImpl(WidgetStoreRepository repository, TxStepProvider stepProvider) {
        this.repository = repository;
        this.stepProvider = stepProvider;
    }

    private WidgetStoreService service;

    public void setProxy(WidgetStoreService service) {
        this.service = service;
    }

    public ProductDto retrieveProduct() {
        return repository.retrieveProduct();
    }

    public void setInventory(int inventory) {
        repository.setInventory(inventory);
    }

    public OrderDto retrieveOrder(int orderId) {
        return repository.retrieveOrder(orderId);
    }

    public List<OrderDto> retrieveOrders() {
        return repository.retrieveOrders();
    }

    @Workflow
    public String checkoutWorkflow(String key) {
        Integer orderId = stepProvider.runTxStep(dsl -> { return WidgetStoreRepository.createOrder(dsl); }, "createOrder");
        try {
            DBOS.runStep(() -> repository.subtractInventory(), "subtractInventory");
        } catch (RuntimeException e) {
            logger.error("Failed to reserve inventory for order {}", orderId);
            DBOS.runStep(() -> repository.errorOrder(orderId), "errorOrder");
            DBOS.setEvent(PAYMENT_ID, null);
        }

        DBOS.setEvent(PAYMENT_ID, key);

        String payment_status = (String) DBOS.recv(PAYMENT_STATUS, Duration.ofSeconds(60));

        if (payment_status != null && payment_status.equals("paid")) {
            logger.info("Payment successful for order {}", orderId);
            DBOS.runStep(() -> repository.markOrderPaid(orderId), "markOrderPaid");
            DBOS.startWorkflow(() -> service.dispatchOrderWorkflow(orderId));
        } else {
            logger.info("Payment failed for order {}", orderId);
            DBOS.runStep(() -> repository.errorOrder(orderId), "errorOrder");
            DBOS.runStep(() -> repository.undoSubtractInventory(), "undoSubtractInventory");
        }
        
        DBOS.setEvent(ORDER_ID, String.valueOf(orderId));
        return key;
    }

    @Workflow
    public void dispatchOrderWorkflow(Integer orderId) {
        for (int i = 0; i < 10; i++) {
            DBOS.sleep(Duration.ofSeconds(1));
            DBOS.runStep(() -> repository.updateOrderProgress(orderId), "updateOrderProgress");
        }
    }
}
