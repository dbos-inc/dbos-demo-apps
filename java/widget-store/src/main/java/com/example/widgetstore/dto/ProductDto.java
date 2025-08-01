package com.example.widgetstore.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;

public class ProductDto {
    @JsonProperty("product_id")
    private Integer productId;
    
    @JsonProperty("product")
    private String product;
    
    @JsonProperty("description")
    private String description;
    
    @JsonProperty("inventory")
    private Integer inventory;
    
    @JsonProperty("price")
    private BigDecimal price;

    // Constructors
    public ProductDto() {}

    public ProductDto(Integer productId, String product, String description, Integer inventory, BigDecimal price) {
        this.productId = productId;
        this.product = product;
        this.description = description;
        this.inventory = inventory;
        this.price = price;
    }

    // Getters and Setters
    public Integer getProductId() {
        return productId;
    }

    public void setProductId(Integer productId) {
        this.productId = productId;
    }

    public String getProduct() {
        return product;
    }

    public void setProduct(String product) {
        this.product = product;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Integer getInventory() {
        return inventory;
    }

    public void setInventory(Integer inventory) {
        this.inventory = inventory;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }
}