package com.example.dbosstarter.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import com.example.dbosstarter.service.DurableStarterService;
import com.example.dbosstarter.service.DurableStarterServiceImpl;

import dev.dbos.transact.DBOS;

@Configuration
public class DurableStarterConfig {

    @Primary
    @Bean
    public DurableStarterService durableStarterService() {
	    var impl = new DurableStarterServiceImpl();
	    var proxy = DBOS.registerWorkflows(
            DurableStarterService.class,
            impl);
	    impl.setDurableStarterService(proxy);
        return proxy;
    }
}
