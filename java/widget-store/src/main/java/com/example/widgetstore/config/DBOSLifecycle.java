package com.example.widgetstore.config;

import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;

import dev.dbos.transact.DBOS;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
@Lazy(false)
public class DBOSLifecycle implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(DBOSLifecycle.class);
    private volatile boolean running = false;

    @Override
    public void start() {
        log.info("Launch DBOS");
        DBOS.launch();
        running = true;
    }

    @Override
    public void stop() {
        log.info("Shut Down DBOS");
        try {
            DBOS.shutdown();
        } catch (Exception e) {
            log.warn("DBOS shutdown error", e);
        } finally {
            running = false;
        }
    }

    @Override public boolean isRunning() { return running; }

    @Override public boolean isAutoStartup() { return true; }

    // Start BEFORE the web server (default is 0). Lower = earlier.
    @Override public int getPhase() { return -1; }
}
