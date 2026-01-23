package com.example.dbos_starter.config

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.web.server.context.WebServerInitializedEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

private val logger = LoggerFactory.getLogger(AppStartedLogger::class.java)

@Component
class AppStartedLogger(@Value("\${spring.application.name:MyApp}") private val appName: String) {

    @EventListener
    fun handleWebServerInit(event: WebServerInitializedEvent) {
        val port = event.webServer.port
        logger.info("🚀 {} Server is running on http://localhost:{}", appName, port)
    }
}