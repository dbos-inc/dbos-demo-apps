package com.example.widgetstore.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

public class OrderDto {
    @JsonProperty("order_id")
    private Integer orderId;
    
    @JsonProperty("order_status")
    private Integer orderStatus;
    
    @JsonProperty("last_update_time")
    private LocalDateTime lastUpdateTime;
    
    @JsonProperty("product_id")
    private Integer productId;
    
    @JsonProperty("progress_remaining")
    private Integer progressRemaining;

    // Constructors
    public OrderDto() {}

    public OrderDto(Integer orderId, Integer orderStatus, LocalDateTime lastUpdateTime, 
                    Integer productId, Integer progressRemaining) {
        this.orderId = orderId;
        this.orderStatus = orderStatus;
        this.lastUpdateTime = lastUpdateTime;
        this.productId = productId;
        this.progressRemaining = progressRemaining;
    }

    // Getters and Setters
    public Integer getOrderId() {
        return orderId;
    }

    public void setOrderId(Integer orderId) {
        this.orderId = orderId;
    }

    public Integer getOrderStatus() {
        return orderStatus;
    }

    public void setOrderStatus(Integer orderStatus) {
        this.orderStatus = orderStatus;
    }

    public LocalDateTime getLastUpdateTime() {
        return lastUpdateTime;
    }

    public void setLastUpdateTime(LocalDateTime lastUpdateTime) {
        this.lastUpdateTime = lastUpdateTime;
    }

    public Integer getProductId() {
        return productId;
    }

    public void setProductId(Integer productId) {
        this.productId = productId;
    }

    public Integer getProgressRemaining() {
        return progressRemaining;
    }

    public void setProgressRemaining(Integer progressRemaining) {
        this.progressRemaining = progressRemaining;
    }
}