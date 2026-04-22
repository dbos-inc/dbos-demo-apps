package org.example;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.StartWorkflowOptions;
import dev.dbos.transact.config.DBOSConfig;
import dev.dbos.transact.workflow.Queue;
import dev.dbos.transact.workflow.Workflow;
import dev.dbos.transact.workflow.WorkflowHandle;
import dev.dbos.transact.workflow.WorkflowSchedule;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Objects;

import io.javalin.Javalin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

interface DurableToolboxService {

  void exampleWorkflow();

  void queueWorkflow();

  void queueChildWorkflow(int i);

  void scheduledWorkflow(Instant scheduledTime, Object context);
}

class DurableToolboxServiceImpl implements DurableToolboxService {
  private static final Logger logger = LoggerFactory.getLogger(DurableToolboxServiceImpl.class);
  public static final String STEPS_EVENT = "steps_event";

  private final DBOS dbos;
  private DurableToolboxService self;

  public DurableToolboxServiceImpl(DBOS dbos) {
    this.dbos = dbos;
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

  @Override
  @Workflow
  public void exampleWorkflow() {
    dbos.runStep(() -> logger.info("Step one completed!"), "stepOne");
    dbos.runStep(() -> logger.info("Step two completed!"), "stepTwo");
  }

  @Override
  @Workflow
  public void queueWorkflow() {
    logger.info("Enqueueing steps");

    var handles = new ArrayList<WorkflowHandle<Void, RuntimeException>>();
    var options = new StartWorkflowOptions().withQueue("example-queue");
    for (var i = 0; i < 10; i++) {
      final var step = i;
      var handle = dbos.startWorkflow(() -> self.queueChildWorkflow(step), options);
      handles.add(handle);
    }

    var results = new ArrayList<Void>();
    for (var h : handles) {
      results.add(h.getResult());
    }

    logger.info("successfully completed {} steps", results.size());
  }

  @Override
  @Workflow
  public void queueChildWorkflow(int i) {
    sleep(Duration.ofSeconds(5));
    logger.info("queueChildWorkflow step {} completed!", i);
  }

  @Override
  @Workflow
  public void scheduledWorkflow(Instant scheduledTime, Object context) {
    logger.info("I am a scheduled workflow. It is currently {}", scheduledTime);
  }
}

public class App {
  private static final Logger logger = LoggerFactory.getLogger(App.class);

  public static void main(String[] args) {

    var dbUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
    if (dbUrl == null || dbUrl.isEmpty()) {
      dbUrl = "jdbc:postgresql://localhost:5432/dbos_starter_java";
    }
    var dbUser = Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres");
    var dbPassword = Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos");

    var dbosConfig =
        DBOSConfig.defaults("dbos-starter-java")
            .withDatabaseUrl(dbUrl)
            .withDbUser(dbUser)
            .withDbPassword(dbPassword)
            .withAppVersion("0.2.0");

    var dbos = new DBOS(dbosConfig);

    var queue = new Queue("example-queue");
    dbos.registerQueue(queue);

    var impl = new DurableToolboxServiceImpl(dbos);
    var proxy = dbos.registerProxy(DurableToolboxService.class, impl);
    impl.setSelf(proxy);

    @SuppressWarnings("unused")
    var app =
        Javalin.create(
                config -> {
                  config.startup.showJavalinBanner = false;
                  // config.staticFiles.add("/public");
                  config.events.serverStarting(
                      () -> {
                        dbos.launch();
                        dbos.applySchedules(
                            new WorkflowSchedule(
                                "run_every_min",
                                "scheduledWorkflow",
                                DurableToolboxServiceImpl.class.getName(),
                                "0 * * * * *"));
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
                  // TODO: Transactional step provider endpoint
                  config.routes.post(
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
