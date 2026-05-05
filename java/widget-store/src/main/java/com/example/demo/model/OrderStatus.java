package com.example.demo.model;

import jakarta.persistence.EnumeratedValue;

public enum OrderStatus {
  PENDING(0),
  DISPATCHED(1),
  PAID(2),
  CANCELLED(-1);

  @EnumeratedValue private final int value;

  OrderStatus(int value) {
    this.value = value;
  }

  public int value() {
    return value;
  }
}
