package com.example.dbos_starter.config

import com.example.dbos_starter.service.DurableStarterService
import com.example.dbos_starter.service.DurableStarterServiceImpl
import dev.dbos.transact.DBOS
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Primary
import registerWorkflows

@Configuration
class DurableStarterConfig {

    @Primary
    @Bean
    fun durableStarterService(): DurableStarterService {
        return registerWorkflows<DurableStarterService>(DurableStarterServiceImpl())
    }
}