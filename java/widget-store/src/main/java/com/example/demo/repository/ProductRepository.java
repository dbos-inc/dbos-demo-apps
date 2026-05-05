package com.example.demo.repository;

import com.example.demo.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ProductRepository extends JpaRepository<Product, Integer> {

  @Modifying
  @Query("UPDATE Product p SET p.inventory = :inventory WHERE p.productId = :productId")
  void setInventory(int productId, int inventory);

  @Modifying
  @Query(
      "UPDATE Product p SET p.inventory = p.inventory - 1"
          + " WHERE p.productId = :productId AND p.inventory >= 1")
  int subtractInventory(int productId);

  @Modifying
  @Query("UPDATE Product p SET p.inventory = p.inventory + 1 WHERE p.productId = :productId")
  void addInventory(int productId);
}
