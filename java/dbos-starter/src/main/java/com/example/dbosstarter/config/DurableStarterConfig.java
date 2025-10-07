package com.example.dbosstarter.config;

import java.util.Objects;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import com.example.dbosstarter.service.DurableStarterService;
import com.example.dbosstarter.service.DurableStarterServiceImpl;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.config.DBOSConfig;

@Configuration
public class DurableStarterConfig {

    @Primary
    @Bean
    public DurableStarterService durableStarterService(DBOS dbos) {
        var proxy = dbos.<DurableStarterService>Workflow()
            .interfaceClass(DurableStarterService.class)
            .implementation(new DurableStarterServiceImpl())
            .build();
        proxy.setDurableStarterService(proxy);
        return proxy;
    }

    @Bean
    public DBOS dbos(DBOSConfig config) {
        return DBOS.initialize(config);
    }

    @Bean
    DBOSConfig dbosConfig() {
        String databaseUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
        if (databaseUrl == null || databaseUrl.isEmpty()) {
            databaseUrl = "jdbc:postgresql://localhost:5432/dbos_starter_java";
        }
        return new DBOSConfig.Builder()
                .appName("dbos-starter")
                .databaseUrl(databaseUrl)
                .dbUser(Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres"))
                .dbPassword(Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos"))
                .runAdminServer()
                .adminServerPort(3001)
                .build();
    }
}
