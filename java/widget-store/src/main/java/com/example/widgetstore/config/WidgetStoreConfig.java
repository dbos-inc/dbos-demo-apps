package com.example.widgetstore.config;

import com.example.widgetstore.service.WidgetStoreService;
import com.example.widgetstore.service.WidgetStoreServiceImpl;
import dev.dbos.transact.DBOS;
import dev.dbos.transact.config.DBOSConfig;
import org.jooq.DSLContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class WidgetStoreConfig {

    @Bean
    @Primary
    public WidgetStoreService widgetStoreServiceProxy(DBOS dbos, DSLContext dslContext) {
        WidgetStoreService proxy = dbos.<WidgetStoreService>Workflow()
                .interfaceClass(WidgetStoreService.class)
                .implementation(new WidgetStoreServiceImpl(dslContext))
                .async()
                .build();
        proxy.setWidgetStoreService(proxy);
        return proxy;
    }

    @Bean 
    DBOSConfig dbosConfig() {
        return new DBOSConfig.Builder()
                .name("widget-store")
                .dbHost("localhost")
                .dbPort(5432)
                .dbUser("postgres")
                .dbPassword("dbos")
                .sysDbName("widget_store_java")
                .runAdminServer()
                .build();
    }

    @Bean
    public DBOS dbos(DBOSConfig config) {
        return DBOS.initialize(config);
    }
}