package com.example.dbos_starter.config

import org.springframework.context.SmartLifecycle
import org.springframework.context.annotation.Lazy
import org.springframework.stereotype.Component
import dev.dbos.transact.DBOS
import dev.dbos.transact.config.DBOSConfig
import java.util.concurrent.atomic.AtomicBoolean
import org.slf4j.Logger
import org.slf4j.LoggerFactory

private val logger: Logger = LoggerFactory.getLogger(DBOSLifecycle::class.java)

@Component
@Lazy(false)
class DBOSLifecycle : SmartLifecycle {

    private val running = AtomicBoolean(false)

    private fun getEnvOrDefault(envVar: String, defaultValue: String): String {
        val value = System.getenv(envVar)
        return if (value.isNullOrBlank()) defaultValue else value
    }

    override fun start() {
        if (running.compareAndSet(false, true)) {
            val config = DBOSConfig.defaults("dbos-starter")
                .withDatabaseUrl(getEnvOrDefault("DBOS_SYSTEM_JDBC_URL",
                    "jdbc:postgresql://localhost:5432/dbos_starter_java"))
                .withDbUser(getEnvOrDefault("PGUSER", "postgres"))
                .withDbPassword(getEnvOrDefault("PGPASSWORD", "dbos"))
                .withAdminServer(true)
                .withAdminServerPort(3001)
            DBOS.configure(config)
            DBOS.launch()
        } else {
            logger.debug("DBOS already running, skipping start()")
        }
    }

    override fun stop() {
        if (running.compareAndSet(true, false)) {
            try {
                DBOS.shutdown()
            } catch (e: Exception) {
                logger.error("Error during DBOS shutdown", e)
                // Don't rethrow - we still consider it stopped
            }
        } else {
            logger.debug("DBOS not running, skipping shutdown()")
        }
    }

    override fun isRunning(): Boolean {
        return running.get()
    }
}