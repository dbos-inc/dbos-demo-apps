package com.example.demo.controller;

import static com.example.demo.service.WidgetStoreService.ORDER_ID;
import static com.example.demo.service.WidgetStoreService.PAYMENT_ID;
import static com.example.demo.service.WidgetStoreService.PAYMENT_STATUS;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.StartWorkflowOptions;

import java.time.Duration;

import com.example.demo.dto.OrderDto;
import com.example.demo.dto.ProductDto;
import com.example.demo.repository.WidgetStoreRepository;
import com.example.demo.service.WidgetStoreService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@CrossOrigin(origins = "*")
public class WidgetStoreController {

  private static final Logger logger = LoggerFactory.getLogger(WidgetStoreController.class);

  private final DBOS dbos;
  private final WidgetStoreService service;
  private final WidgetStoreRepository widgetStoreRepo;

  public WidgetStoreController(
      DBOS dbos, WidgetStoreService service, WidgetStoreRepository widgetStoreRepo) {
    this.dbos = dbos;
    this.service = service;
    this.widgetStoreRepo = widgetStoreRepo;
  }

  @GetMapping("/product")
  public ResponseEntity<ProductDto> getProduct() {
    var dto = widgetStoreRepo.retrieveProduct();
    if (dto == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found");
    }
    return ResponseEntity.ok(dto);
  }

  @GetMapping("/order/{orderId}")
  public ResponseEntity<OrderDto> getOrder(@PathVariable Integer orderId) {
    var dto = widgetStoreRepo.retrieveOrder(orderId);
    if (dto == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found");
    }
    return ResponseEntity.ok(dto);
  }

  @GetMapping("/orders")
  public ResponseEntity<java.util.List<OrderDto>> getOrders() {
    var dtos = widgetStoreRepo.retrieveOrders();
    return ResponseEntity.ok(dtos);
  }

  @PostMapping("/restock")
  public ResponseEntity<Void> restockProduct() {
    widgetStoreRepo.setInventory(100);
    return ResponseEntity.ok().build();
  }

  @PostMapping("/checkout/{key}")
  public ResponseEntity<String> checkout(@PathVariable String key) {
    logger.info("Checkout requested with key: " + key);

    var options = new StartWorkflowOptions(key);
    dbos.startWorkflow(() -> service.checkoutWorkflow(), options);
    var paymentId = dbos.<String>getEvent(key, PAYMENT_ID, Duration.ofSeconds(60));
    if (paymentId.isEmpty()) {
      throw new RuntimeException("Item not available");
    } else {
      return ResponseEntity.ok(paymentId.get());
    }
  }

  @PostMapping("/payment_webhook/{key}/{status}")
  public ResponseEntity<String> paymentWebhook(
      @PathVariable String key, @PathVariable String status) {
    logger.info("Payment webhook called with key: " + key + ", status: " + status);

    dbos.send(key, status, PAYMENT_STATUS);
    var orderId = dbos.<String>getEvent(key, ORDER_ID, Duration.ofSeconds(60));
    return ResponseEntity.ok(orderId.orElse(null));
  }

  // Crash endpoint for testing
  @PostMapping("/crash_application")
  public ResponseEntity<Void> crashApplication() {
    logger.warn("Crash endpoint called - terminating application");
    Runtime.getRuntime().halt(0);
    return ResponseEntity.ok().build();
  }
}
