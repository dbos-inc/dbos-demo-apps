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
public class DBOSConfigInitializer {

    @Bean
    @Primary
    public WidgetStoreService widgetStoreServiceProxy(DBOS dbos, DSLContext dslContext) {
        WidgetStoreService proxy = dbos.<WidgetStoreService>Workflow()
                .interfaceClass(WidgetStoreService.class)
                .implementation(new WidgetStoreServiceImpl(dslContext))
                .build();
        proxy.setWidgetStoreService(proxy);
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