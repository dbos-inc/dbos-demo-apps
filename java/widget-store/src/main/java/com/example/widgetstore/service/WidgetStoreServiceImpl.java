package com.example.widgetstore.service;

import java.time.Duration;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import static com.example.widgetstore.constants.Constants.ORDER_ID;
import static com.example.widgetstore.constants.Constants.PAYMENT_ID;
import static com.example.widgetstore.constants.Constants.PAYMENT_STATUS;
import com.example.widgetstore.dto.OrderDto;
import com.example.widgetstore.dto.ProductDto;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.workflow.Workflow;

@Service
public class WidgetStoreServiceImpl implements WidgetStoreService {
    
    private static final Logger logger = LoggerFactory.getLogger(WidgetStoreServiceImpl.class);

    private final WidgetStoreRepository repository;

    public WidgetStoreServiceImpl(WidgetStoreRepository repository) {
        this.repository = repository;
    }

    private WidgetStoreService service;

    @Autowired
    public void setProxy(@Lazy WidgetStoreService service) {
        this.service = service;
    }

    @Override
    public ProductDto retrieveProduct() {
        return repository.retrieveProduct();
    }

    @Override
    public void setInventory(int inventory) {
        repository.setInventory(inventory);
    }

    @Override
    public OrderDto retrieveOrder(int orderId) {
        return repository.retrieveOrder(orderId);
    }

    @Override
    public List<OrderDto> retrieveOrders() {
        return repository.retrieveOrders();
    }

    @Workflow
    @Override
    public String checkoutWorkflow(String key) {
        Integer orderId = DBOS.runStep(() -> repository.createOrder(), "createOrder");
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
    @Override
    public void dispatchOrderWorkflow(Integer orderId) {
        for (int i = 0; i < 10; i++) {
            DBOS.sleep(Duration.ofSeconds(1));
            DBOS.runStep(() -> repository.updateOrderProgress(orderId), "updateOrderProgress");
        }
    }
}
