package org.example;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.StartWorkflowOptions;
import dev.dbos.transact.config.DBOSConfig;
import dev.dbos.transact.workflow.Workflow;

import java.time.Duration;
import java.util.Objects;

import io.javalin.Javalin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

interface DurableStarterService {
  void exampleWorkflow() throws InterruptedException;
}

class DurableStarterServiceImpl implements DurableStarterService {

  private static final Logger logger = LoggerFactory.getLogger(DurableStarterServiceImpl.class);
  public static final String STEPS_EVENT = "steps_event";

  private final DBOS dbos;

  public DurableStarterServiceImpl(DBOS dbos) {
    this.dbos = dbos;
  }

  private void stepOne() throws InterruptedException {
    Thread.sleep(5000);
    logger.info("Workflow {} step 1 completed!", DBOS.workflowId());
  }

  private void stepTwo() throws InterruptedException {
    Thread.sleep(5000);
    logger.info("Workflow {} step 2 completed!", DBOS.workflowId());
  }

  private void stepThree() throws InterruptedException {
    Thread.sleep(5000);
    logger.info("Workflow {} step 3 completed!", DBOS.workflowId());
  }

  @Workflow
  @Override
  public void exampleWorkflow() throws InterruptedException {
    dbos.runStep(this::stepOne, "stepOne");
    dbos.setEvent(STEPS_EVENT, 1);
    dbos.runStep(this::stepTwo, "stepTwo");
    dbos.setEvent(STEPS_EVENT, 2);
    dbos.runStep(this::stepThree, "stepThree");
    dbos.setEvent(STEPS_EVENT, 3);
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

    var proxy =
        dbos.registerProxy(DurableStarterService.class, new DurableStarterServiceImpl(dbos));

    @SuppressWarnings("unused")
    var app =
        Javalin.create(
                config -> {
                  config.startup.showJavalinBanner = false;
                  config.events.serverStarting(dbos::launch);
                  config.events.serverStopping(dbos::shutdown);
                  config.routes.get(
                      "/",
                      ctx -> {
                        ctx.contentType("text/html");
                        ctx.result(App.class.getResourceAsStream("/index.html"));
                      });
                  config.routes.get(
                      "/workflow/{taskId}",
                      ctx -> {
                        var taskId = ctx.pathParam("taskId");
                        dbos.startWorkflow(
                            () -> proxy.exampleWorkflow(), new StartWorkflowOptions(taskId));
                        ctx.status(200);
                      });
                  config.routes.get(
                      "/last_step/{taskId}",
                      ctx -> {
                        var taskId = ctx.pathParam("taskId");
                        var step =
                            dbos.<Integer>getEvent(
                                    taskId,
                                    DurableStarterServiceImpl.STEPS_EVENT,
                                    Duration.ofSeconds(0))
                                .orElse(0);
                        ctx.result(String.valueOf(step));
                      });
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
