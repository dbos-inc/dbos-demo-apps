package com.example.demo.config;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.config.DBOSConfig;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Objects;

import javax.sql.DataSource;

import com.example.demo.repository.WidgetStoreRepository;
import com.example.demo.service.WidgetStoreService;
import com.example.demo.service.WidgetStoreServiceImpl;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class WidgetStoreConfig {

  // eventually, we'll have a transact-spring package that will read DBOSConfig from app properties,
  // create the DBOS instance and use Spring Aspects to register and proxy @Workflow methods
  // automatically
  @Bean
  public WidgetStoreService widgetStoreService(DBOS dbos, WidgetStoreRepository repo) {
    var impl = new WidgetStoreServiceImpl(dbos, repo);
    var proxy = dbos.registerWorkflows(WidgetStoreService.class, impl);
    impl.setSelf(proxy);
    return proxy;
  }

  @Bean
  public DBOS dbos(DBOSConfig config) throws SQLException {
    return new DBOS(config);
  }

  @Bean
  public DBOSConfig dbosConfig() {
    String databaseUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
    if (databaseUrl == null || databaseUrl.isEmpty()) {
      databaseUrl = "jdbc:postgresql://localhost:5432/widget_store_java_sysdb";
    }
    return DBOSConfig.defaults("widget-store-java")
        .withDatabaseUrl(databaseUrl)
        .withDbUser(Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres"))
        .withDbPassword(Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos"))
        .withAdminServer(true)
        .withAppVersion("0.1.0");
  }

  // Manually create the DataSource bean so we can create the demo app database if it doesn't
  // already exist
  @Bean
  @Primary
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

  private void ensureDatabaseExists(String url, String username, String password) {
    String dbName = url.substring(url.lastIndexOf('/') + 1);
    String adminUrl = url.substring(0, url.lastIndexOf('/')) + "/postgres";

    try (var conn = DriverManager.getConnection(adminUrl, username, password);
        var stmt = conn.prepareStatement("SELECT 1 FROM pg_database WHERE datname = ?")) {
      stmt.setString(1, dbName);
      if (!stmt.executeQuery().next()) {
        try (var create = conn.createStatement()) {
          create.execute("CREATE DATABASE \"" + dbName + "\"");
          System.out.println("Created database: " + dbName);
        }
      }
    } catch (SQLException e) {
      throw new RuntimeException("Failed to ensure database exists: " + e.getMessage(), e);
    }
  }
}
