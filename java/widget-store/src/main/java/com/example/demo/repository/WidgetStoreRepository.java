package com.example.demo.repository;

import java.time.LocalDateTime;
import java.util.List;

import com.example.demo.dto.OrderDto;
import com.example.demo.dto.ProductDto;
import com.example.demo.model.Order;
import com.example.demo.model.OrderStatus;
import com.example.demo.model.Product;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// DBOS @Workflow annotations are not compatible with Spring  @Transactional annotations yet.
// So for now, all of the database logic is in this separate service class that is injected into the
// Workflow class

@Service
public class WidgetStoreRepository {

  private static final int PRODUCT_ID = 1;

  private final ProductRepository productRepository;
  private final OrderRepository orderRepository;

  public WidgetStoreRepository(
      ProductRepository productRepository, OrderRepository orderRepository) {
    this.productRepository = productRepository;
    this.orderRepository = orderRepository;
  }

  public ProductDto retrieveProduct() {
    return productRepository.findById(PRODUCT_ID).map(ProductDto::fromEntity).orElse(null);
  }

  @Transactional
  public void setInventory(int inventory) {
    productRepository.setInventory(PRODUCT_ID, inventory);
  }

  @Transactional
  public void subtractInventory() {
    int updated = productRepository.subtractInventory(PRODUCT_ID);
    if (updated == 0) {
      throw new RuntimeException("Insufficient Inventory");
    }
  }

  @Transactional
  public void undoSubtractInventory() {
    productRepository.addInventory(PRODUCT_ID);
  }

  @Transactional
  public Integer createOrder() {
    Product product = productRepository.getReferenceById(PRODUCT_ID);
    Order order = new Order();
    order.setOrderStatus(OrderStatus.PENDING);
    order.setProduct(product);
    order.setLastUpdateTime(LocalDateTime.now());
    order.setProgressRemaining(10);
    return orderRepository.save(order).orderId();
  }

  public OrderDto retrieveOrder(int orderId) {
    return orderRepository.findById(orderId).map(OrderDto::fromEntity).orElse(null);
  }

  public List<OrderDto> retrieveOrders() {
    return orderRepository.findAllByOrderByOrderIdDesc().stream()
        .map(OrderDto::fromEntity)
        .toList();
  }

  @Transactional
  public void markOrderPaid(int orderId) {
    orderRepository.updateOrderStatus(orderId, OrderStatus.PAID);
  }

  @Transactional
  public void errorOrder(int orderId) {
    orderRepository.updateOrderStatus(orderId, OrderStatus.CANCELLED);
  }

  @Transactional
  public void updateOrderProgress(int orderId) {
    Order order =
        orderRepository
            .findById(orderId)
            .orElseThrow(() -> new RuntimeException("Order not found: " + orderId));
    order.setProgressRemaining(order.progressRemaining() - 1);
    order.setLastUpdateTime(LocalDateTime.now());
    if (order.progressRemaining() == 0) {
      order.setOrderStatus(OrderStatus.DISPATCHED);
    }
    orderRepository.save(order);
  }
}
