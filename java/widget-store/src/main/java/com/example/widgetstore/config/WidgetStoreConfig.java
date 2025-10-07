package com.example.widgetstore.config;

import com.example.widgetstore.service.WidgetStoreService;
import com.example.widgetstore.service.WidgetStoreServiceImpl;
import dev.dbos.transact.DBOS;
import dev.dbos.transact.config.DBOSConfig;

import java.util.Objects;

import org.jooq.DSLContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class WidgetStoreConfig {

    @Bean
    @Primary
    public WidgetStoreService widgetStoreServiceProxy(DBOS dbos, DSLContext dslContext) {
        var impl = new WidgetStoreServiceImpl(dslContext);
	    var proxy = dbos.registerWorkflows(WidgetStoreService.class, impl);
        impl.setWidgetStoreService(proxy);
        return proxy;
    }

    @Bean
    DBOSConfig dbosConfig() {
        String databaseUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
        if (databaseUrl == null || databaseUrl.isEmpty()) {
            databaseUrl = "jdbc:postgresql://localhost:5432/dbos_starter_java";
        }
        return new DBOSConfig.Builder()
                .appName("widget-store")
                .databaseUrl(databaseUrl)
                .dbUser(Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres"))
                .dbPassword(Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos"))
                .runAdminServer()
                .build();
    }

    @Bean
    public DBOS dbos(DBOSConfig config) {
        return DBOS.initialize(config);
    }
}