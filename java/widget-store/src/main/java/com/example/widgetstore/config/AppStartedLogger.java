package com.example.widgetstore.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;

@Component
public class AppStartedLogger implements ApplicationListener<WebServerInitializedEvent> {

    private static final Logger logger = LoggerFactory.getLogger(AppStartedLogger.class);

    private final String appName;

    public AppStartedLogger(@Value("${spring.application.name:MyApp}") String appName) {
        this.appName = appName;
    }

    @Override
    public void onApplicationEvent(@NonNull WebServerInitializedEvent event) {
        int port = event.getWebServer().getPort();
        logger.info("🚀 {} Server is running on http://localhost:{}", appName, port);
    }
}
