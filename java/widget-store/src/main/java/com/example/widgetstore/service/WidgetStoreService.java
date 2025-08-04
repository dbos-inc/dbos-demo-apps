package com.example.widgetstore.service;

import com.example.widgetstore.dto.OrderDto;
import com.example.widgetstore.dto.ProductDto;

import java.util.List;

public interface WidgetStoreService {

    void setWidgetStoreService(WidgetStoreService service);
    
    // Product methods
    ProductDto retrieveProduct();
    void setInventory(int inventory);
    
    // Inventory methods (DBOS Steps)
    void subtractInventory() throws RuntimeException;
    void undoSubtractInventory();
    
    // Order methods (DBOS Steps)
    Integer createOrder();
    OrderDto retrieveOrder(int orderId);
    List<OrderDto> retrieveOrders();
    void markOrderPaid(int orderId);
    void errorOrder(int orderId);
    
    // Workflow methods
    String checkoutWorkflow(String key);
    void tempSendWorkflow(String destinationId, Object message, String topic);
}