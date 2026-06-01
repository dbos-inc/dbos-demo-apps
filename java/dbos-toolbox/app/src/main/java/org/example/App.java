package org.example;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.StartWorkflowOptions;
import dev.dbos.transact.config.DBOSConfig;
import dev.dbos.transact.database.SystemDatabase;
import dev.dbos.transact.migrations.MigrationManager;
import dev.dbos.transact.txstep.JdbcStepFactory;
import dev.dbos.transact.workflow.Debouncer;
import dev.dbos.transact.workflow.QueueOptions;
import dev.dbos.transact.workflow.Workflow;
import dev.dbos.transact.workflow.WorkflowHandle;
import dev.dbos.transact.workflow.WorkflowSchedule;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

import io.javalin.Javalin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

interface DurableToolboxService {

  void exampleWorkflow();

  void queueWorkflow();

  void queueChildWorkflow(String workflowId, int i);

  void scheduledWorkflow(Instant scheduledTime, Object context);

  int txStepWorkflow(String name) throws SQLException;

  void debouncerWorkflow(String key);
}

class DurableToolboxServiceImpl implements DurableToolboxService {
  private static final Logger logger = LoggerFactory.getLogger(DurableToolboxServiceImpl.class);
  public static final String STEPS_EVENT = "steps_event";

  private final DBOS dbos;
  private final JdbcStepFactory stepFactory;
  private DurableToolboxService self;

  public DurableToolboxServiceImpl(DBOS dbos, JdbcStepFactory stepFactory) {
    this.dbos = dbos;
    this.stepFactory = stepFactory;
  }

  public void setSelf(DurableToolboxService self) {
    this.self = self;
  }

  private void sleep(Duration duration) {
    try {
      Thread.sleep(duration.toMillis());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      logger.error("Sleep interrupted", e);
    }
  }

  private int insertGreeting(Connection conn, String user) throws SQLException {
    var sql =
        """
        INSERT INTO greetings(name, greet_count)
        VALUES (?, 1)
        ON CONFLICT(name)
        DO UPDATE SET greet_count = greetings.greet_count + 1
        RETURNING greet_count
        """;

    try (var stmt = conn.prepareStatement(sql)) {
      stmt.setString(1, Objects.requireNonNull(user));
      try (var rs = stmt.executeQuery()) {
        var greetCount = rs.next() ? rs.getInt("greet_count") : 0;
        return greetCount;
      }
    }
  }

  @Override
  @Workflow
  public void exampleWorkflow() {
    dbos.runStep(() -> logger.info("Step one completed!"), "stepOne");
    dbos.runStep(() -> logger.info("Step two completed!"), "stepTwo");
  }

  @Override
  @Workflow
  public void queueWorkflow() {
    final var workflowId = DBOS.workflowId();
    logger.info("Enqueueing steps workflow {}", workflowId);

    var handles = new ArrayList<WorkflowHandle<Void, RuntimeException>>();
    var options = new StartWorkflowOptions().withQueue("example-queue");
    for (var i = 0; i < 10; i++) {
      final var step = i;
      var handle = dbos.startWorkflow(() -> self.queueChildWorkflow(workflowId, step), options);
      handles.add(handle);
    }

    var results = new ArrayList<Void>();
    for (var h : handles) {
      results.add(h.getResult());
    }

    logger.info("Workflow {} successfully completed {} steps", workflowId, results.size());
  }

  @Override
  @Workflow
  public void queueChildWorkflow(String workflowId, int i) {
    logger.info("Running workflow {} queued child step {}", workflowId, i);
    sleep(Duration.ofSeconds(5));
    logger.info("Workflow {} queued child step {} completed!", workflowId, i);
  }

  @Override
  @Workflow
  public void scheduledWorkflow(Instant scheduledTime, Object context) {
    logger.info("I am a scheduled workflow. It is currently {}", scheduledTime);
  }

  @Override
  @Workflow
  public void debouncerWorkflow(String key) {
    logger.info("Debounced workflow executing for key '{}'", key);
  }

  @Override
  @Workflow
  public int txStepWorkflow(String name) throws SQLException {
    var result = stepFactory.txStep((Connection c) -> insertGreeting(c, name), "insertGreeting");
    logger.info("{} has been greeted {} times", name, result);
    return result;
  }
}

public class App {
  private static final Logger logger = LoggerFactory.getLogger(App.class);

  public static void main(String[] args) throws SQLException {

    var _dbUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
    if (_dbUrl == null || _dbUrl.isEmpty()) {
      _dbUrl = "jdbc:postgresql://localhost:5432/dbos_starter_java";
    }
    final var dbUrl = _dbUrl;
    final var dbUser = Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres");
    final var dbPassword = Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos");

    // ensure database exists so we can create the greetings table needed for txStepWorkflow
    MigrationManager.createDatabaseIfNotExists(dbUrl, dbUser, dbPassword);

    var dbosConfig =
        DBOSConfig.defaults("dbos-starter-java")
            .withDatabaseUrl(dbUrl)
            .withDbUser(dbUser)
            .withDbPassword(dbPassword)
            .withAppVersion("0.2.0");

    var dbos = new DBOS(dbosConfig);
    var dataSource = SystemDatabase.createDataSource(dbosConfig);
    var stepFactory = new JdbcStepFactory(dbos, dataSource);

    try (var conn = dataSource.getConnection();
        var stmt = conn.createStatement()) {
      stmt.execute(
          "CREATE TABLE IF NOT EXISTS greetings(name text NOT NULL, greet_count integer DEFAULT 0, PRIMARY KEY(name))");
    }

    var impl = new DurableToolboxServiceImpl(dbos, stepFactory);
    var proxy = dbos.registerProxy(DurableToolboxService.class, impl);
    impl.setSelf(proxy);

    var debouncerRef = new AtomicReference<Debouncer<Void>>();

    @SuppressWarnings("unused")
    var app =
        Javalin.create(
                config -> {
                  config.startup.showJavalinBanner = false;
                  config.events.serverStarting(
                      () -> {
                        dbos.launch();
                        debouncerRef.set(
                            dbos.<Void>debouncer().withDebounceTimeout(Duration.ofMinutes(1)));
                        dbos.registerQueue("example-queue", QueueOptions.empty());
                        dbos.applySchedules(
                            new WorkflowSchedule(
                                "run_every_min",
                                "scheduledWorkflow",
                                DurableToolboxServiceImpl.class.getName(),
                                "*/15 * * * * *"));
                      });
                  config.events.serverStopping(() -> dbos.shutdown());
                  config.routes.get(
                      "/",
                      ctx -> {
                        ctx.contentType("text/html");
                        ctx.result(App.class.getResourceAsStream("/index.html"));
                      });
                  config.routes.get(
                      "/workflow",
                      ctx -> {
                        proxy.exampleWorkflow();
                        ctx.status(200);
                      });
                  config.routes.get(
                      "/queue",
                      ctx -> {
                        proxy.queueWorkflow();
                        ctx.status(200);
                      });
                  config.routes.get(
                      "/tx-step/{name}",
                      ctx -> {
                        var name = ctx.pathParam("name");
                        proxy.txStepWorkflow(name);
                        ctx.status(200);
                      });
                  config.routes.get(
                      "/debounce/{key}",
                      ctx -> {
                        var key = ctx.pathParam("key");
                        logger.info("Debounce endpoint called for key '{}'", key);
                        debouncerRef
                            .get()
                            .debounce(
                                key, Duration.ofSeconds(5), () -> proxy.debouncerWorkflow(key));
                        ctx.status(200);
                      });
                  config.routes.get(
                      "/crash",
                      ctx -> {
                        logger.warn("Crash endpoint called - terminating application");
                        Runtime.getRuntime().halt(0);
                        ctx.status(200);
                      });
                })
            .start(7070);
  }
}
