package com.example.widgetstore.service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

import org.jooq.DSLContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static com.example.widgetstore.constants.Constants.ORDER_ID;
import static com.example.widgetstore.constants.Constants.PAYMENT_ID;
import static com.example.widgetstore.constants.Constants.PAYMENT_STATUS;
import static com.example.widgetstore.constants.Constants.PRODUCT_ID;
import com.example.widgetstore.dto.OrderDto;
import com.example.widgetstore.dto.ProductDto;
import static com.example.widgetstore.generated.Tables.ORDERS;
import static com.example.widgetstore.generated.Tables.PRODUCTS;
import com.example.widgetstore.generated.tables.pojos.Orders;
import com.example.widgetstore.generated.tables.pojos.Products;
import com.example.widgetstore.model.OrderStatus;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.workflow.Workflow;

public class WidgetStoreServiceImpl implements WidgetStoreService {

    private static final Logger logger = LoggerFactory.getLogger(WidgetStoreServiceImpl.class);

    private final TxStepProvider stepProvider;

    public WidgetStoreServiceImpl(TxStepProvider stepProvider) {
        this.stepProvider = stepProvider;
    }

    private WidgetStoreService service;

    public void setProxy(WidgetStoreService service) {
        this.service = service;
    }

    public ProductDto retrieveProduct() {
        return stepProvider.runTxStep(dsl -> { return retrieveProduct(dsl); }, "retrieveProduct");
    }

    public void setInventory(int inventory) {
        stepProvider.runTxStep(dsl -> { setInventory(dsl, inventory); }, "setInventory");
    }

    public OrderDto retrieveOrder(int orderId) {
        return stepProvider.runTxStep(dsl -> { return retrieveOrder(dsl, orderId); }, "retrieveOrder");
    }

    public List<OrderDto> retrieveOrders() {
        return stepProvider.runTxStep(dsl -> { return retrieveOrders(dsl); }, "retrieveOrders");
    }

    @Workflow
    public String checkoutWorkflow(String key) {
        // Integer orderId = DBOS.runStep(() -> repository.createOrder(),
        // "createOrder");
        Integer orderId = stepProvider.runTxStep(dsl -> {
            return createOrder(dsl);
        }, "createOrder");
        try {
            stepProvider.runTxStep(dsl -> {
                subtractInventory(dsl);
            }, "subtractInventory");
        } catch (RuntimeException e) {
            logger.error("Failed to reserve inventory for order {}", orderId);
            stepProvider.runTxStep(dsl -> {
                errorOrder(dsl, orderId);
            }, "errorOrder");
            DBOS.setEvent(PAYMENT_ID, null);
        }

        DBOS.setEvent(PAYMENT_ID, key);

        String payment_status = (String) DBOS.recv(PAYMENT_STATUS, Duration.ofSeconds(60));

        if (payment_status != null && payment_status.equals("paid")) {
            logger.info("Payment successful for order {}", orderId);
            stepProvider.runTxStep(dsl -> {
                markOrderPaid(dsl, orderId);
            }, "markOrderPaid");
            DBOS.startWorkflow(() -> service.dispatchOrderWorkflow(orderId));
        } else {
            logger.info("Payment failed for order {}", orderId);
            stepProvider.runTxStep(dsl -> {
                errorOrder(dsl, orderId);
            }, "errorOrder");
            stepProvider.runTxStep(dsl -> {
                undoSubtractInventory(dsl);
            }, "undoSubtractInventory");
        }

        DBOS.setEvent(ORDER_ID, String.valueOf(orderId));
        return key;
    }

    @Workflow
    public void dispatchOrderWorkflow(Integer orderId) {
        for (int i = 0; i < 10; i++) {
            DBOS.sleep(Duration.ofSeconds(1));
            stepProvider.runTxStep(dsl -> { updateOrderProgress(dsl, orderId); }, "updateOrderProgress");
        }
    }

    // Static methods moved from WidgetStoreRepository

    public static ProductDto retrieveProduct(DSLContext dsl) {
        Products product = dsl.selectFrom(PRODUCTS)
                .where(PRODUCTS.PRODUCT_ID.eq(PRODUCT_ID))
                .fetchOneInto(Products.class);

        if (product == null) {
            return null;
        }

        return new ProductDto(
                product.getProductId(),
                product.getProduct(),
                product.getDescription(),
                product.getInventory(),
                product.getPrice());
    }

    public static void setInventory(DSLContext dsl, int inventory) {
        dsl.update(PRODUCTS)
                .set(PRODUCTS.INVENTORY, inventory)
                .where(PRODUCTS.PRODUCT_ID.eq(PRODUCT_ID))
                .execute();
    }

    public static void subtractInventory(DSLContext dsl) throws RuntimeException {
        int updated = dsl.update(PRODUCTS)
                .set(PRODUCTS.INVENTORY, PRODUCTS.INVENTORY.minus(1))
                .where(PRODUCTS.PRODUCT_ID.eq(PRODUCT_ID))
                .and(PRODUCTS.INVENTORY.ge(1))
                .execute();

        if (updated == 0) {
            throw new RuntimeException("Insufficient Inventory");
        }
    }

    public static void undoSubtractInventory(DSLContext dsl) {
        dsl.update(PRODUCTS)
                .set(PRODUCTS.INVENTORY, PRODUCTS.INVENTORY.plus(1))
                .where(PRODUCTS.PRODUCT_ID.eq(PRODUCT_ID))
                .execute();
    }

    public static Integer createOrder(DSLContext dsl) {
        return dsl.insertInto(ORDERS)
                .set(ORDERS.ORDER_STATUS, OrderStatus.PENDING.getValue())
                .set(ORDERS.PRODUCT_ID, PRODUCT_ID)
                .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                .set(ORDERS.PROGRESS_REMAINING, 10)
                .returningResult(ORDERS.ORDER_ID)
                .fetchOne()
                .get(ORDERS.ORDER_ID);
    }

    public static OrderDto retrieveOrder(DSLContext dsl, int orderId) {
        Orders order = dsl.selectFrom(ORDERS)
                .where(ORDERS.ORDER_ID.eq(orderId))
                .fetchOneInto(Orders.class);

        if (order == null) {
            return null;
        }

        return new OrderDto(
                order.getOrderId(),
                order.getOrderStatus(),
                order.getLastUpdateTime(),
                order.getProductId(),
                order.getProgressRemaining());
    }

    public static List<OrderDto> retrieveOrders(DSLContext dsl) {
        List<Orders> orders = dsl.selectFrom(ORDERS)
                .orderBy(ORDERS.ORDER_ID.desc())
                .fetchInto(Orders.class);

        return orders.stream()
                .map(order -> new OrderDto(
                        order.getOrderId(),
                        order.getOrderStatus(),
                        order.getLastUpdateTime(),
                        order.getProductId(),
                        order.getProgressRemaining()))
                .collect(Collectors.toList());
    }

    public static void markOrderPaid(DSLContext dsl, int orderId) {
        dsl.update(ORDERS)
                .set(ORDERS.ORDER_STATUS, OrderStatus.PAID.getValue())
                .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                .where(ORDERS.ORDER_ID.eq(orderId))
                .execute();
    }

    public static void errorOrder(DSLContext dsl, int orderId) {
        dsl.update(ORDERS)
                .set(ORDERS.ORDER_STATUS, OrderStatus.CANCELLED.getValue())
                .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                .where(ORDERS.ORDER_ID.eq(orderId))
                .execute();
    }

    public static void updateOrderProgress(DSLContext dsl, Integer orderId) {
        Integer progressRemaining = dsl.update(ORDERS)
                .set(ORDERS.PROGRESS_REMAINING, ORDERS.PROGRESS_REMAINING.minus(1))
                .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                .where(ORDERS.ORDER_ID.eq(orderId))
                .returningResult(ORDERS.PROGRESS_REMAINING)
                .fetchOne()
                .get(ORDERS.PROGRESS_REMAINING);

        if (progressRemaining == 0) {
            dsl.update(ORDERS)
                    .set(ORDERS.ORDER_STATUS, OrderStatus.DISPATCHED.getValue())
                    .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                    .where(ORDERS.ORDER_ID.eq(orderId))
                    .execute();
        }
    }
}
