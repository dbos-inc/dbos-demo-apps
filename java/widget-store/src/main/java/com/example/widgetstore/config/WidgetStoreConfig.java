package com.example.widgetstore.config;

import com.example.widgetstore.service.WidgetStoreService;
import com.example.widgetstore.service.WidgetStoreServiceImpl;
import dev.dbos.transact.DBOS;

import org.jooq.DSLContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class WidgetStoreConfig {

    @Bean
    @Primary
    public WidgetStoreService widgetStoreServiceProxy(DSLContext dslContext) {
        var impl = new WidgetStoreServiceImpl(dslContext);
	    var proxy = DBOS.registerWorkflows(WidgetStoreService.class, impl);
        impl.setWidgetStoreService(proxy);
        return proxy;
    }
}