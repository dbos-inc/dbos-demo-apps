package com.example.dbosstarter.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.example.dbosstarter.service.DurableStarterService;
import com.example.dbosstarter.service.DurableStarterServiceImpl;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.config.DBOSConfig;

@Configuration
public class DurableStarterConfig {

    @Bean
    public DurableStarterService durableStarterService(DBOS dbos) {
        var proxy = dbos.<DurableStarterService>Workflow()
            .interfaceClass(DurableStarterService.class)
            .implementation(new DurableStarterServiceImpl())
            .async()
            .build();
        proxy.setDurableStarterService(proxy);
        return proxy;
    }

    @Bean
    public DBOS dbos() {
        DBOSConfig config = new DBOSConfig.Builder()
                .name("dbos-starter")
                .dbHost("localhost")
                .dbPort(5432)
                .dbUser("postgres")
                .sysDbName("dbos_starter_java")
                .runAdminServer()
                .build();

        DBOS dbos = DBOS.initialize(config);
        dbos.launch();
        return dbos;
    }
}
