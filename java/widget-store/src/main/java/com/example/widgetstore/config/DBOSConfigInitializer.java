package com.example.widgetstore.config;

import com.example.widgetstore.service.WidgetStoreService;
import com.example.widgetstore.workflow.CheckoutWorkflowService;
import com.example.widgetstore.workflow.CheckoutWorkflowServiceImpl;
import dev.dbos.transact.DBOS;
import dev.dbos.transact.config.DBOSConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DBOSConfigInitializer {

    @Bean
    public CheckoutWorkflowService checkoutWorkflowService(DBOS dbos, WidgetStoreService widgetStoreService) {
        CheckoutWorkflowServiceImpl impl = new CheckoutWorkflowServiceImpl();
        impl.setWidgetStoreService(widgetStoreService);
        
        CheckoutWorkflowService proxy = dbos.<CheckoutWorkflowService>Workflow()
                .interfaceClass(CheckoutWorkflowService.class)
                .implementation(impl)
                .build();

        proxy.setCheckoutWorkflowService(proxy);
        return proxy;
    }

    @Bean
    public DBOS initDBOS() {
        DBOSConfig config = new DBOSConfig.Builder()
                .name("widget-store")
                .dbHost("localhost")
                .dbPort(5432)
                .dbUser("postgres")
                .dbPassword("dbos")
                .sysDbName("widget_store_java")
                .runAdminServer()
                .build();

        DBOS dbos = DBOS.initialize(config);
        dbos.launch();
        return dbos;
    }
}