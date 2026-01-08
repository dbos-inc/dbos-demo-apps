package com.example.dbos_starter.config;

import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.config.DBOSConfig;

import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
@Lazy(false)
public class DBOSLifecycle implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(DBOSLifecycle.class);
    private final AtomicBoolean running = new AtomicBoolean(false);

    private static String getEnvOrDefault(String envVar, String defaultValue) {
        String value = System.getenv(envVar);
        return (value == null || value.isBlank()) ? defaultValue : value;
    }

    @Override
    public void start() {
        if (running.compareAndSet(false, true)) {
            var config = DBOSConfig.defaults("dbos-starter")
                    .withDatabaseUrl(getEnvOrDefault("DBOS_SYSTEM_JDBC_URL",
                            "jdbc:postgresql://localhost:5432/dbos_starter_java"))
                    .withDbUser(getEnvOrDefault("PGUSER", "postgres"))
                    .withDbPassword(getEnvOrDefault("PGPASSWORD", "dbos"))
                    .withAdminServer(true)
                    .withAdminServerPort(3001);
            DBOS.configure(config);
            DBOS.launch();
        } else {
            log.debug("DBOS already running, skipping start()");
        }
    }

    @Override
    public void stop() {
        if (running.compareAndSet(true, false)) {
            try {
                DBOS.shutdown();
            } catch (Exception e) {
                log.error("Error during DBOS shutdown", e);
                // Don't rethrow - we still consider it stopped
            }
        } else {
            log.debug("DBOS not running, skipping shutdown()");
        }

    }

    @Override
    public boolean isRunning() {
        return running.get();
    }
}