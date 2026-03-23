package com.example.demo.service;

public interface WidgetStoreService {
  public static final String PAYMENT_STATUS = "payment_status";
  public static final String PAYMENT_ID = "payment_id";
  public static final String ORDER_ID = "order_id";

  void checkoutWorkflow();

  void dispatchOrderWorkflow(Integer orderId);
}
