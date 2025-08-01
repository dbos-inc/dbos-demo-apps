package com.example.widgetstore.workflow;

public interface CheckoutWorkflowService {
    
    String checkoutWorkflow(String key);
    
    void setCheckoutWorkflowService(CheckoutWorkflowService checkoutWorkflowService);
}