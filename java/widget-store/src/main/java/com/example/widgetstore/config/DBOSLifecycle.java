package com.example.widgetstore.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import dev.dbos.transact.DBOS;

@Component
@Lazy(false)
public class DBOSLifecycle implements SmartLifecycle {

    private final DBOS.Instance dbos;

    public DBOSLifecycle(DBOS.Instance dbos) {
        this.dbos = dbos;
    }

    private static final Logger log = LoggerFactory.getLogger(DBOSLifecycle.class);
    private volatile boolean running = false;


    @Override
    public void start() {
        log.info("Launch DBOS");
        dbos.launch();
        running = true;
    }


    @Override
    public void stop() {
        log.info("Shut Down DBOS");
        try {
            dbos.shutdown();
        } finally {
            running = false;
        }
    }

    @Override public boolean isRunning() { return running; }

    @Override public boolean isAutoStartup() { return true; }

    // Start BEFORE the web server (default is 0). Lower = earlier.
    @Override public int getPhase() { return -1; }
}
