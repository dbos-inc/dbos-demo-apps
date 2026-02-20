package com.example.widgetstore.config;

import com.example.widgetstore.service.TxStepProvider;
import com.example.widgetstore.service.WidgetStoreService;
import com.example.widgetstore.service.WidgetStoreServiceImpl;
import dev.dbos.transact.DBOS;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class WidgetStoreConfig {

    @Bean
    @Primary
    public WidgetStoreService widgetStoreService(TxStepProvider stepProvider) {
        stepProvider.createTxResultsTable();
        
        var impl = new WidgetStoreServiceImpl(stepProvider);
        var proxy = DBOS.registerWorkflows(WidgetStoreService.class, impl);
        impl.setProxy(proxy);
        return proxy;
    }
}