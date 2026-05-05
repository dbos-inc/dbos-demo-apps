package com.example.demo.dto;

import java.time.LocalDateTime;

import com.example.demo.model.Order;
import com.fasterxml.jackson.annotation.JsonProperty;

public record OrderDto(
    @JsonProperty("order_id") Integer orderId,
    @JsonProperty("order_status") Integer orderStatus,
    @JsonProperty("last_update_time") LocalDateTime lastUpdateTime,
    @JsonProperty("product_id") Integer productId,
    @JsonProperty("progress_remaining") Integer progressRemaining) {
  public static OrderDto fromEntity(Order order) {
    return new OrderDto(
        order.orderId(),
        order.orderStatus().value(),
        order.lastUpdateTime(),
        order.product().productId(),
        order.progressRemaining());
  }
}
