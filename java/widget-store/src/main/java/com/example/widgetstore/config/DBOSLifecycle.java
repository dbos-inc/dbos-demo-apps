package com.example.widgetstore.config;

import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.config.DBOSConfig;

import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
@Lazy(false)
public class DBOSLifecycle implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(DBOSLifecycle.class);
    private volatile boolean running = false;

    @Override
    public void start() {
        String databaseUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
        if (databaseUrl == null || databaseUrl.isEmpty()) {
            databaseUrl = "jdbc:postgresql://localhost:5432/widget_store_java";
        }
        var config = DBOSConfig.defaults("widget-store")
                .withDatabaseUrl(databaseUrl)
                .withDbUser(Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres"))
                .withDbPassword(Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos"))
                .withAdminServer(true);
        DBOS.configure(config);

        log.info("Launch DBOS");
        DBOS.launch();
        running = true;
    }

    @Override
    public void stop() {
        log.info("Shut Down DBOS");
        try {
            DBOS.shutdown();
        } finally {
            running = false;
        }
    }

    @Override public boolean isRunning() { return running; }

    @Override public boolean isAutoStartup() { return true; }

    // Start BEFORE the web server (default is 0). Lower = earlier.
    @Override public int getPhase() { return -1; }
}
