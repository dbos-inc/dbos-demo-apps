package com.example.widgetstore.workflow;

import com.example.widgetstore.service.WidgetStoreService;
import dev.dbos.transact.workflow.Workflow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class CheckoutWorkflowServiceImpl implements CheckoutWorkflowService {

    private static final Logger logger = LoggerFactory.getLogger(CheckoutWorkflowServiceImpl.class);

    @Autowired
    CheckoutWorkflowService checkoutWorkflowService;

    @Autowired
    WidgetStoreService widgetStoreService;

    public void setCheckoutWorkflowService(CheckoutWorkflowService checkoutWorkflowService) {
        this.checkoutWorkflowService = checkoutWorkflowService;
    }

    public void setWidgetStoreService(WidgetStoreService widgetStoreService) {
        this.widgetStoreService = widgetStoreService;
    }

    @Workflow(name = "checkoutWorkflow")
    public String checkoutWorkflow(String key) {
        logger.info("Starting checkout workflow with key: {}", key);
        
        try {
            // Step 1: Subtract inventory
            logger.info("Subtracting inventory");
            widgetStoreService.subtractInventory();
            
            // Step 2: Create order
            logger.info("Creating order");
            Integer orderId = widgetStoreService.createOrder();
            
            logger.info("Checkout workflow completed successfully. Order ID: {}, Key: {}", orderId, key);
            return key;
            
        } catch (Exception e) {
            logger.error("Checkout workflow failed for key: {}", key, e);
            throw new RuntimeException("Checkout workflow failed", e);
        }
    }
}