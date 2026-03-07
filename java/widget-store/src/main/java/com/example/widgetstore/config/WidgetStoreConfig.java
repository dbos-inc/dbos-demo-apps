package com.example.widgetstore.config;

import java.util.Objects;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import com.example.widgetstore.service.WidgetStoreService;
import com.example.widgetstore.service.WidgetStoreServiceImpl;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.config.DBOSConfig;

@Configuration
public class WidgetStoreConfig {

    @Bean
    @Primary
    public WidgetStoreService widgetStoreService(DBOSConfig config, WidgetStoreServiceImpl impl) {
        return DBOS.registerWorkflows(WidgetStoreService.class, impl);
    }

    @Bean
    public DBOSConfig dbosConfig() {
        String databaseUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
        if (databaseUrl == null || databaseUrl.isEmpty()) {
            databaseUrl = "jdbc:postgresql://localhost:5432/widget_store_java";
        }
        var config = DBOSConfig.defaults("widget-store")
                .withDatabaseUrl(databaseUrl)
                .withDbUser(Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres"))
                .withDbPassword(Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos"))
                .withAdminServer(true)
                .withAppVersion("0.1.0");
        DBOS.configure(config);

        return config;
    }

}
