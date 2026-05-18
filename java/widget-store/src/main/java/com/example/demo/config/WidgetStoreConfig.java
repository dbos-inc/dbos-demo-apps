package com.example.demo.config;

import java.sql.DriverManager;
import java.sql.SQLException;

import javax.sql.DataSource;

import com.example.demo.model.Product;
import com.example.demo.repository.ProductRepository;
import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.boot.web.server.context.WebServerInitializedEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

// Note, this file does not have any DBOS code in it.
// DBOSConfig and DBOS beans are auto configured by transact-spring-boot-starter
// DBOS launch/shutdown is automatically invoked by auto configured DBOSLifecycle bean
// DBOS @Workflow methods are automatically registered by auto configured DBOSWorkflowRegistrar bean
// DBOS @Workflow and @Step classes are automatically proxied by auto configured DBOSAspect bean

// This configuration class is only responsible for creating/migrating/seeding the app db and for
// logging the app url on startup

@Configuration
public class WidgetStoreConfig {

  private static final Logger logger = LoggerFactory.getLogger(WidgetStoreConfig.class);

  @Component
  static class AppStartedLogger {
    @Value("${dbos.application.name}")
    private String appName;

    @EventListener
    public void onWebServerReady(WebServerInitializedEvent event) {
      logger.info(
          "🚀 {} Server is running on http://localhost:{}",
          appName,
          event.getWebServer().getPort());
    }
  }

  // Manually create the DataSource bean so we can create the demo app database if it doesn't
  // already exist
  @Bean
  public DataSource dataSource(
      @Value("${spring.datasource.url}") String url,
      @Value("${spring.datasource.username}") String username,
      @Value("${spring.datasource.password}") String password) {

    ensureDatabaseExists(url, username, password);

    return DataSourceBuilder.create().url(url).username(username).password(password).build();
  }

  @Bean(initMethod = "migrate")
  public Flyway flyway(DataSource dataSource) {
    return Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load();
  }

  @Bean
  public ApplicationRunner seedData(ProductRepository productRepository) {
    return args -> {
      if (!productRepository.existsById(1)) {
        logger.info("Seeding initial product data");
        Product widget = new Product();
        widget.setProductId(1);
        widget.setProduct("Premium Quality Widget");
        widget.setDescription("Enhance your productivity with our top-rated widgets!");
        widget.setInventory(100);
        widget.setPrice(new java.math.BigDecimal("99.99"));
        productRepository.save(widget);
      }
    };
  }

  private void ensureDatabaseExists(String url, String username, String password) {
    String dbName = url.substring(url.lastIndexOf('/') + 1);
    String adminUrl = url.substring(0, url.lastIndexOf('/')) + "/postgres";

    try (var conn = DriverManager.getConnection(adminUrl, username, password);
        var stmt = conn.prepareStatement("SELECT 1 FROM pg_database WHERE datname = ?")) {
      stmt.setString(1, dbName);
      if (!stmt.executeQuery().next()) {
        logger.info("Creating database: {}", dbName);
        try (var create = conn.createStatement()) {
          create.execute("CREATE DATABASE \"" + dbName + "\"");
        }
      }
    } catch (SQLException e) {
      throw new RuntimeException("Failed to ensure database exists: " + e.getMessage(), e);
    }
  }
}
