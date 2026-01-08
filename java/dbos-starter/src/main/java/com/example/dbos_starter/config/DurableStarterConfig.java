package com.example.dbos_starter.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import com.example.dbos_starter.service.DurableStarterService;
import com.example.dbos_starter.service.DurableStarterServiceImpl;

import dev.dbos.transact.DBOS;

@Configuration
public class DurableStarterConfig {

    @Primary
    @Bean
    public DurableStarterService durableStarterService() {
	    var proxy = DBOS.registerWorkflows(
            DurableStarterService.class,
            new DurableStarterServiceImpl());
        return proxy;
    }
}
