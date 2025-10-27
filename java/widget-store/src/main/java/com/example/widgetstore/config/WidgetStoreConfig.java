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
    public WidgetStoreService widgetStoreService(DSLContext dslContext) {
        var impl = new WidgetStoreServiceImpl(dslContext);
	    var proxy = DBOS.registerWorkflows(WidgetStoreService.class, impl);
        impl.setProxy(proxy);
        return proxy;
    }

    @Bean
    DBOSConfig dbosConfig() {
        String databaseUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
        if (databaseUrl == null || databaseUrl.isEmpty()) {
            databaseUrl = "jdbc:postgresql://localhost:5432/widget_store_java";
        }
        return DBOSConfig.defaults("widget-store")
                .withDatabaseUrl(databaseUrl)
                .withDbUser(Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres"))
                .withDbPassword(Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos"))
                .withAdminServer(true);
    }

    @Bean
    public DBOS.Instance dbos(DBOSConfig config) {
        return DBOS.configure(config);
    }
}