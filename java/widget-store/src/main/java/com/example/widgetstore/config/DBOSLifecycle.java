package com.example.widgetstore.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import dev.dbos.transact.DBOS;

@Component
public class DBOSLifecycle  {
        
    private static final Logger logger = LoggerFactory.getLogger(DBOSLifecycle.class);

    private final DBOS.Instance dbos;

    public DBOSLifecycle(DBOS.Instance dbos) {
        this.dbos = dbos;
    }

    @EventListener
    public void onApplicationReady(ApplicationReadyEvent event) {
        logger.debug("onApplicationReady - dbos.launch()");
        DBOS.launch();
    }

    @EventListener
    public void onContextClosed(ContextClosedEvent event) {
        logger.debug("onContextClosed - dbos.shutdown()");
        try {
            DBOS.shutdown();
        }
        catch (Exception e) {
            logger.debug("onContextClosed - dbos.shutdown() exception", e);
        }
    }
}
