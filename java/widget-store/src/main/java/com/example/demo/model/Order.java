package com.example.demo.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "orders")
public class Order {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "order_id")
  private Integer orderId;

  @Column(name = "order_status", nullable = false)
  private OrderStatus orderStatus;

  @Column(name = "last_update_time", nullable = false)
  private LocalDateTime lastUpdateTime;

  @ManyToOne
  @JoinColumn(name = "product_id", nullable = false)
  private Product product;

  @Column(name = "progress_remaining", nullable = false)
  private Integer progressRemaining;

  public Integer orderId() {
    return orderId;
  }

  public void setOrderId(Integer orderId) {
    this.orderId = orderId;
  }

  public OrderStatus orderStatus() {
    return orderStatus;
  }

  public void setOrderStatus(OrderStatus orderStatus) {
    this.orderStatus = orderStatus;
  }

  public LocalDateTime lastUpdateTime() {
    return lastUpdateTime;
  }

  public void setLastUpdateTime(LocalDateTime lastUpdateTime) {
    this.lastUpdateTime = lastUpdateTime;
  }

  public Product product() {
    return product;
  }

  public void setProduct(Product product) {
    this.product = product;
  }

  public Integer progressRemaining() {
    return progressRemaining;
  }

  public void setProgressRemaining(Integer progressRemaining) {
    this.progressRemaining = progressRemaining;
  }
}
