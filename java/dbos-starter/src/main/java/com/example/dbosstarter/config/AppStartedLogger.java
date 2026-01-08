package com.example.dbosstarter.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.server.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class AppStartedLogger {

    private static final Logger logger = LoggerFactory.getLogger(AppStartedLogger.class);
    private final String appName;

    public AppStartedLogger(@Value("${spring.application.name:MyApp}") String appName) {
        this.appName = appName;
    }

    @EventListener
    public void handleWebServerInit(WebServerInitializedEvent event) {
        int port = event.getWebServer().getPort();
        logger.info("🚀 {} Server is running on http://localhost:{}", appName, port);
    }
}
