package com.example.dbosstarter.config;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;

import dev.dbos.transact.DBOS;

@Component
public class DBOSLifecycle implements ApplicationListener<ApplicationEvent>  {

    private final DBOS dbos;

    public DBOSLifecycle(DBOS dbos) {
        this.dbos = dbos;
    }

    @Override
    public void onApplicationEvent(@NonNull ApplicationEvent event) {
        if (event instanceof ApplicationReadyEvent) {
            dbos.launch();
        } else if (event instanceof ContextClosedEvent) {
            dbos.shutdown(); // cleanup resources
        }
    }
}
