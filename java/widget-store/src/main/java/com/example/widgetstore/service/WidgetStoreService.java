package com.example.widgetstore.service;

import com.example.widgetstore.dto.OrderDto;
import com.example.widgetstore.dto.ProductDto;

import java.util.List;

public interface WidgetStoreService {

    void setProxy(WidgetStoreService service);
    
    // Product methods
    ProductDto retrieveProduct();
    void setInventory(int inventory);
    
    // Order query methods
    OrderDto retrieveOrder(int orderId);
    List<OrderDto> retrieveOrders();
    
    // Workflow methods
    String checkoutWorkflow(String key);
    void dispatchOrderWorkflow(Integer orderId);
}