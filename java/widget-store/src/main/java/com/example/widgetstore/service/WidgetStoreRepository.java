package com.example.widgetstore.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

import org.jooq.DSLContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import static com.example.widgetstore.constants.Constants.PRODUCT_ID;
import com.example.widgetstore.dto.OrderDto;
import com.example.widgetstore.dto.ProductDto;
import static com.example.widgetstore.generated.Tables.ORDERS;
import static com.example.widgetstore.generated.Tables.PRODUCTS;
import com.example.widgetstore.generated.tables.pojos.Orders;
import com.example.widgetstore.generated.tables.pojos.Products;
import com.example.widgetstore.model.OrderStatus;

/**
 * Repository layer that handles all database operations.
 * Uses JOOQ's native transaction management where needed.
 */
@Service
public class WidgetStoreRepository {
    
    private static final Logger logger = LoggerFactory.getLogger(WidgetStoreRepository.class);

    private final DSLContext dsl;

    public WidgetStoreRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public ProductDto retrieveProduct() {
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
                product.getPrice()
        );
    }

    public void setInventory(int inventory) {
        dsl.update(PRODUCTS)
                .set(PRODUCTS.INVENTORY, inventory)
                .where(PRODUCTS.PRODUCT_ID.eq(PRODUCT_ID))
                .execute();
    }

    public void subtractInventory() throws RuntimeException {
        int updated = dsl.update(PRODUCTS)
                .set(PRODUCTS.INVENTORY, PRODUCTS.INVENTORY.minus(1))
                .where(PRODUCTS.PRODUCT_ID.eq(PRODUCT_ID))
                .and(PRODUCTS.INVENTORY.ge(1))
                .execute();
        
        if (updated == 0) {
            throw new RuntimeException("Insufficient Inventory");
        }
    }

    public void undoSubtractInventory() {
        dsl.update(PRODUCTS)
                .set(PRODUCTS.INVENTORY, PRODUCTS.INVENTORY.plus(1))
                .where(PRODUCTS.PRODUCT_ID.eq(PRODUCT_ID))
                .execute();
    }

    public Integer createOrder() {
        return dsl.insertInto(ORDERS)
                .set(ORDERS.ORDER_STATUS, OrderStatus.PENDING.getValue())
                .set(ORDERS.PRODUCT_ID, PRODUCT_ID)
                .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                .set(ORDERS.PROGRESS_REMAINING, 10)
                .returningResult(ORDERS.ORDER_ID)
                .fetchOne()
                .get(ORDERS.ORDER_ID);
    }

    public OrderDto retrieveOrder(int orderId) {
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
                order.getProgressRemaining()
        );
    }

    public List<OrderDto> retrieveOrders() {
        List<Orders> orders = dsl.selectFrom(ORDERS)
                .orderBy(ORDERS.ORDER_ID.desc())
                .fetchInto(Orders.class);
        
        return orders.stream()
                .map(order -> new OrderDto(
                        order.getOrderId(),
                        order.getOrderStatus(),
                        order.getLastUpdateTime(),
                        order.getProductId(),
                        order.getProgressRemaining()
                ))
                .collect(Collectors.toList());
    }

    public void markOrderPaid(int orderId) {
        dsl.update(ORDERS)
                .set(ORDERS.ORDER_STATUS, OrderStatus.PAID.getValue())
                .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                .where(ORDERS.ORDER_ID.eq(orderId))
                .execute();
    }

    public void errorOrder(int orderId) {
        dsl.update(ORDERS)
                .set(ORDERS.ORDER_STATUS, OrderStatus.CANCELLED.getValue())
                .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                .where(ORDERS.ORDER_ID.eq(orderId))
                .execute();
    }

    public void updateOrderProgress(Integer orderId) {
        logger.info("updateOrderProgress() - Using JOOQ transaction management");
        
        // Use JOOQ's native transaction for multi-operation atomicity
        dsl.transaction(configuration -> {
            DSLContext txDsl = configuration.dsl();
            
            Integer progressRemaining = txDsl.update(ORDERS)
                    .set(ORDERS.PROGRESS_REMAINING, ORDERS.PROGRESS_REMAINING.minus(1))
                    .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                    .where(ORDERS.ORDER_ID.eq(orderId))
                    .returningResult(ORDERS.PROGRESS_REMAINING)
                    .fetchOne()
                    .get(ORDERS.PROGRESS_REMAINING);

            if (progressRemaining == 0) {
                txDsl.update(ORDERS)
                        .set(ORDERS.ORDER_STATUS, OrderStatus.DISPATCHED.getValue())
                        .set(ORDERS.LAST_UPDATE_TIME, LocalDateTime.now())
                        .where(ORDERS.ORDER_ID.eq(orderId))
                        .execute();
            }
        });
    }
}