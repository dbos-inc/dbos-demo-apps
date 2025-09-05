package com.example.widgetstore.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import static com.example.widgetstore.constants.Constants.ORDER_ID;
import static com.example.widgetstore.constants.Constants.PAYMENT_ID;
import static com.example.widgetstore.constants.Constants.PAYMENT_STATUS;

import com.example.widgetstore.dto.OrderDto;
import com.example.widgetstore.dto.ProductDto;
import com.example.widgetstore.service.WidgetStoreService;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.context.SetWorkflowID;

@RestController
@CrossOrigin(origins = "*")
public class WidgetStoreController {

    private static final Logger logger = LoggerFactory.getLogger(WidgetStoreController.class);

    @Autowired
    private WidgetStoreService widgetStoreService;

    @Autowired
    private DBOS dbos;

    @GetMapping("/product")
    public ResponseEntity<ProductDto> getProduct() {
        try {
            ProductDto product = widgetStoreService.retrieveProduct();
            if (product == null) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.ok(product);
        } catch (Exception e) {
            logger.error("Error retrieving product", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/order/{orderId}")
    public ResponseEntity<OrderDto> getOrder(@PathVariable Integer orderId) {
        try {
            OrderDto order = widgetStoreService.retrieveOrder(orderId);
            if (order == null) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.ok(order);
        } catch (Exception e) {
            logger.error("Error retrieving order: " + orderId, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/orders")
    public ResponseEntity<List<OrderDto>> getOrders() {
        try {
            List<OrderDto> orders = widgetStoreService.retrieveOrders();
            return ResponseEntity.ok(orders);
        } catch (Exception e) {
            logger.error("Error retrieving orders", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/restock")
    public ResponseEntity<Void> restock() {
        try {
            widgetStoreService.setInventory(100);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            logger.error("Error restocking inventory", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    // DBOS workflow endpoints
    @PostMapping("/checkout/{key}")
    public ResponseEntity<String> checkout(@PathVariable String key) {
        logger.info("Checkout requested with key: " + key);
        
        try {
            // Execute the checkout workflow using DBOS
            try (SetWorkflowID id = new SetWorkflowID(key)) {
                logger.info("Calling checkoutWorkflow on service: {}", widgetStoreService.getClass().getName());
                widgetStoreService.checkoutWorkflow(key);
            }
            String paymentID = (String) dbos.getEvent(key, PAYMENT_ID, 60);
            if (paymentID == null) {
                return ResponseEntity.internalServerError().body("Item not available");
            }
            return ResponseEntity.ok(paymentID);
            
        } catch (RuntimeException e) {
            logger.error("Checkout failed: " + e.getMessage());
            return ResponseEntity.internalServerError().body("Error starting checkout");
        }
    }

    @PostMapping("/payment_webhook/{key}/{status}")
    public ResponseEntity<String> paymentWebhook(@PathVariable String key, @PathVariable String status) {
        logger.info("Payment webhook called with key: " + key + ", status: " + status);
        
        try {
            widgetStoreService.tempSendWorkflow(key, status, PAYMENT_STATUS);
            String orderId = (String) dbos.getEvent(key, ORDER_ID, 60);
            return ResponseEntity.ok(orderId);
        } catch (Exception e) {
            logger.error("Payment webhook processing failed", e);
            return ResponseEntity.internalServerError().body("Error processing payment");
        }
    }

    // Crash endpoint for testing (like in the original)
    @PostMapping("/crash_application")
    public ResponseEntity<Void> crashApplication() {
        logger.warn("Crash endpoint called - terminating application");
        Runtime.getRuntime().halt(0);
        return ResponseEntity.ok().build();
    }
}