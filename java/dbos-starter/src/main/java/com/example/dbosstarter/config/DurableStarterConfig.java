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
    public DurableStarterService durableStarterService() {
	    var impl = new DurableStarterServiceImpl();
	    var proxy = DBOS.registerWorkflows(
            DurableStarterService.class,
            impl);
	    impl.setDurableStarterService(proxy);
        return proxy;
    }

    @Bean
    public DBOS.Instance dbos(DBOSConfig config) {
        return DBOS.configure(config);
    }

    @Bean
    DBOSConfig dbosConfig() {
        String databaseUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
        if (databaseUrl == null || databaseUrl.isEmpty()) {
            databaseUrl = "jdbc:postgresql://localhost:5432/dbos_starter_java";
        }
        return DBOSConfig.defaults("dbos-starter")
                .withDatabaseUrl(databaseUrl)
                .withDbUser(Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres"))
                .withDbPassword(Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos"))
                .withAdminServer(true)
                .withAdminServerPort(3001);
    }
}
