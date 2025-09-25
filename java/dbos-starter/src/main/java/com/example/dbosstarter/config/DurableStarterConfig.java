package com.example.dbosstarter.config;

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

    @Bean DBOSConfig dbosConfig() {
        return new DBOSConfig.Builder()
                .name("dbos-starter")
                .dbHost("localhost")
                .dbPort(5432)
                .dbUser("postgres")
                .sysDbName("dbos_starter_java")
                .runAdminServer()
                .build();
    }

    @Bean
    public DBOS dbos(DBOSConfig config) {
        return DBOS.initialize(config);
    }
}
