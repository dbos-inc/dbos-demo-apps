package com.example.demo.model;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "products")
public class Product {

  @Id
  @Column(name = "product_id")
  private Integer productId;

  @Column(name = "product", unique = true, nullable = false)
  private String product;

  @Column(name = "description", nullable = false, columnDefinition = "TEXT")
  private String description;

  @Column(name = "inventory", nullable = false)
  private Integer inventory;

  @Column(name = "price", nullable = false, precision = 10, scale = 2)
  private BigDecimal price;

  public Integer productId() {
    return productId;
  }

  public void setProductId(Integer productId) {
    this.productId = productId;
  }

  public String product() {
    return product;
  }

  public void setProduct(String product) {
    this.product = product;
  }

  public String description() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public Integer inventory() {
    return inventory;
  }

  public void setInventory(Integer inventory) {
    this.inventory = inventory;
  }

  public BigDecimal price() {
    return price;
  }

  public void setPrice(BigDecimal price) {
    this.price = price;
  }
}
