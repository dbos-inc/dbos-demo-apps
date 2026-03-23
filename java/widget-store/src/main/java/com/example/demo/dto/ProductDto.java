package com.example.demo.dto;

import java.math.BigDecimal;

import com.example.demo.model.Product;
import com.fasterxml.jackson.annotation.JsonProperty;

public record ProductDto(
    @JsonProperty("product_id") Integer productId,
    @JsonProperty("product") String product,
    @JsonProperty("description") String description,
    @JsonProperty("inventory") Integer inventory,
    @JsonProperty("price") BigDecimal price) {
  public static ProductDto fromEntity(Product product) {
    return new ProductDto(
        product.productId(),
        product.product(),
        product.description(),
        product.inventory(),
        product.price());
  }
}
