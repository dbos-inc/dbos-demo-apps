package org.example;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.StartWorkflowOptions;
import dev.dbos.transact.config.DBOSConfig;
import dev.dbos.transact.workflow.ListWorkflowsInput;
import dev.dbos.transact.workflow.QueueConflictResolution;
import dev.dbos.transact.workflow.QueueOptions;
import dev.dbos.transact.workflow.Workflow;
import dev.dbos.transact.workflow.WorkflowSchedule;
import dev.dbos.transact.workflow.WorkflowStatus;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import io.javalin.Javalin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

interface DurableStarterService {
  void exampleWorkflow() throws InterruptedException;

  void scheduledWorkflow(Instant scheduledTime, Object context);

  void enqueuedWorkflow();

  void communicationWorkflow();
}

class DurableStarterServiceImpl implements DurableStarterService {

  private static final Logger logger = LoggerFactory.getLogger(DurableStarterServiceImpl.class);
  public static final String STEPS_EVENT = "steps_event";
  public static final String COMM_STATUS_EVENT = "comm_status";
  public static final String APPROVAL_TOPIC = "approval";

  private final DBOS dbos;

  public DurableStarterServiceImpl(DBOS dbos) {
    this.dbos = dbos;
  }

  private void sleep(Duration duration) {
    try {
      Thread.sleep(duration.toMillis());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  // ---- Workflows tab: a durable workflow with three steps ----

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

  // ---- Schedules tab: a workflow that runs on a cron schedule ----

  @Workflow
  @Override
  public void scheduledWorkflow(Instant scheduledTime, Object context) {
    logger.info("{}: Scheduled workflow starting.", Instant.now());
    dbos.sleep(Duration.ofSeconds(1));
    logger.info("{}: Scheduled workflow ending.", Instant.now());
  }

  // ---- Queues tab: a queue-based workflow with adjustable worker concurrency ----

  @Workflow
  @Override
  public void enqueuedWorkflow() {
    logger.info("{}: Enqueued workflow starting.", Instant.now());
    dbos.sleep(Duration.ofSeconds(5));
    logger.info("{}: Enqueued workflow ending.", Instant.now());
  }

  // ---- Communication tab: a human-in-the-loop workflow ----

  private void commStepOne() {
    sleep(Duration.ofSeconds(2));
    logger.info("Communication workflow: step 1 complete.");
  }

  private void commStepTwo() {
    sleep(Duration.ofSeconds(2));
    logger.info("Communication workflow: step 2 complete.");
  }

  @Workflow
  @Override
  public void communicationWorkflow() {
    dbos.runStep(this::commStepOne, "commStepOne");
    dbos.setEvent(COMM_STATUS_EVENT, "waiting");

    var decision = dbos.<String>recv(APPROVAL_TOPIC, Duration.ofSeconds(120)).orElse("");
    if (decision.equals("approve")) {
      dbos.setEvent(COMM_STATUS_EVENT, "step2");
      dbos.runStep(this::commStepTwo, "commStepTwo");
      dbos.setEvent(COMM_STATUS_EVENT, "completed");
    } else if (decision.equals("deny")) {
      dbos.setEvent(COMM_STATUS_EVENT, "denied");
      logger.info("Communication workflow: denied.");
    } else {
      dbos.setEvent(COMM_STATUS_EVENT, "timeout");
      logger.info("Communication workflow: timed out waiting for approval.");
    }
  }
}

public class App {
  private static final Logger logger = LoggerFactory.getLogger(App.class);

  static final String SCHEDULE_NAME = "scheduled-workflow";
  static final String DEFAULT_CRON = "*/5 * * * * *";
  static final String QUEUE_NAME = "demo-queue";
  static final int DEFAULT_WORKER_CONCURRENCY = 3;

  // Count workflows grouped by status (matches the frontend summary panels).
  private static Map<String, Integer> countByStatus(List<WorkflowStatus> wfs) {
    var counts = new LinkedHashMap<String, Integer>();
    for (var wf : wfs) {
      counts.merge(wf.status().toString(), 1, Integer::sum);
    }
    return counts;
  }

  // Workflows of the given name started in the last 10 minutes.
  private static List<WorkflowStatus> recentByName(DBOS dbos, String name) {
    return dbos.listWorkflows(
        new ListWorkflowsInput()
            .withWorkflowName(List.of(name))
            .withStartTime(Instant.now().minus(Duration.ofMinutes(10)))
            .withLimit(500)
            .withLoadInput(false)
            .withLoadOutput(false));
  }

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
            .withConductorKey(System.getenv("DBOS_CONDUCTOR_KEY"))
            .withAppVersion("0.2.0");

    var dbos = new DBOS(dbosConfig);

    var proxy =
        dbos.registerProxy(DurableStarterService.class, new DurableStarterServiceImpl(dbos));

    Javalin.create(
            config -> {
              config.startup.showJavalinBanner = false;
              config.events.serverStarting(
                  () -> {
                    dbos.launch();
                    // Register the demo queue and apply the default schedule (after launch).
                    dbos.registerQueue(
                        QUEUE_NAME,
                        QueueOptions.setWorkerConcurrency(DEFAULT_WORKER_CONCURRENCY),
                        QueueConflictResolution.NEVER_UPDATE);
                    dbos.applySchedules(
                        new WorkflowSchedule(
                            SCHEDULE_NAME,
                            "scheduledWorkflow",
                            DurableStarterServiceImpl.class.getName(),
                            DEFAULT_CRON));
                  });
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

              // ---- Schedule endpoints ----
              config.routes.get(
                  "/schedule/status",
                  ctx -> {
                    var cron = DEFAULT_CRON;
                    var status = "UNKNOWN";
                    var sched = dbos.getSchedule(SCHEDULE_NAME);
                    if (sched.isPresent()) {
                      cron = sched.get().cron();
                      status = sched.get().status().toString();
                    }
                    var resp = new LinkedHashMap<String, Object>();
                    resp.put("cron", cron);
                    resp.put("schedule_status", status);
                    resp.put("workflow_counts", countByStatus(recentByName(dbos, "scheduledWorkflow")));
                    ctx.json(resp);
                  });
              config.routes.post(
                  "/schedule/apply",
                  ctx -> {
                    var cron = DEFAULT_CRON;
                    try {
                      var body = ctx.bodyAsClass(Map.class);
                      var value = body.get("cron");
                      if (value != null && !value.toString().isBlank()) {
                        cron = value.toString();
                      }
                    } catch (Exception ignored) {
                    }
                    dbos.applySchedules(
                        new WorkflowSchedule(
                            SCHEDULE_NAME,
                            "scheduledWorkflow",
                            DurableStarterServiceImpl.class.getName(),
                            cron));
                    // Explicitly resume so Apply always leaves the schedule active.
                    try {
                      dbos.resumeSchedule(SCHEDULE_NAME);
                    } catch (Exception ignored) {
                    }
                    ctx.json(Map.of("ok", true));
                  });
              config.routes.post(
                  "/schedule/pause",
                  ctx -> {
                    dbos.pauseSchedule(SCHEDULE_NAME);
                    ctx.json(Map.of("ok", true));
                  });
              config.routes.post(
                  "/schedule/resume",
                  ctx -> {
                    dbos.resumeSchedule(SCHEDULE_NAME);
                    ctx.json(Map.of("ok", true));
                  });
              config.routes.post(
                  "/schedule/trigger",
                  ctx -> {
                    dbos.triggerSchedule(SCHEDULE_NAME);
                    ctx.json(Map.of("ok", true));
                  });

              // ---- Queue endpoints ----
              config.routes.get(
                  "/queue/status",
                  ctx -> {
                    // findQueue reads the database-backed (dynamic) queue, so it
                    // reflects runtime concurrency changes; getQueue only sees
                    // statically-registered queues.
                    int workerConcurrency =
                        dbos.findQueue(QUEUE_NAME)
                            .map(q -> q.workerConcurrency())
                            .orElse(DEFAULT_WORKER_CONCURRENCY);
                    var resp = new LinkedHashMap<String, Object>();
                    resp.put("worker_concurrency", workerConcurrency);
                    resp.put("workflow_counts", countByStatus(recentByName(dbos, "enqueuedWorkflow")));
                    ctx.json(resp);
                  });
              config.routes.post(
                  "/queue/enqueue",
                  ctx -> {
                    dbos.startWorkflow(
                        () -> proxy.enqueuedWorkflow(),
                        new StartWorkflowOptions().withQueue(QUEUE_NAME));
                    ctx.json(Map.of("ok", true));
                  });
              config.routes.post(
                  "/queue/concurrency",
                  ctx -> {
                    int concurrency = DEFAULT_WORKER_CONCURRENCY;
                    try {
                      var body = ctx.bodyAsClass(Map.class);
                      var value = body.get("concurrency");
                      if (value instanceof Number n && n.intValue() >= 1) {
                        concurrency = n.intValue();
                      }
                    } catch (Exception ignored) {
                    }
                    dbos.registerQueue(
                        QUEUE_NAME,
                        QueueOptions.setWorkerConcurrency(concurrency),
                        QueueConflictResolution.ALWAYS_UPDATE);
                    ctx.json(Map.of("ok", true));
                  });

              // ---- Communication endpoints ----
              config.routes.get(
                  "/comm/status/{workflowId}",
                  ctx -> {
                    var wfId = ctx.pathParam("workflowId");
                    var state =
                        dbos.<String>getEvent(
                                wfId,
                                DurableStarterServiceImpl.COMM_STATUS_EVENT,
                                Duration.ofSeconds(0))
                            .orElse("step1");
                    ctx.json(Map.of("state", state));
                  });
              config.routes.post(
                  "/comm/start",
                  ctx -> {
                    var wfId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
                    dbos.startWorkflow(
                        () -> proxy.communicationWorkflow(), new StartWorkflowOptions(wfId));
                    ctx.json(Map.of("workflow_id", wfId));
                  });
              config.routes.post(
                  "/comm/approve/{workflowId}",
                  ctx -> {
                    dbos.send(
                        ctx.pathParam("workflowId"),
                        "approve",
                        DurableStarterServiceImpl.APPROVAL_TOPIC);
                    ctx.json(Map.of("ok", true));
                  });
              config.routes.post(
                  "/comm/deny/{workflowId}",
                  ctx -> {
                    dbos.send(
                        ctx.pathParam("workflowId"),
                        "deny",
                        DurableStarterServiceImpl.APPROVAL_TOPIC);
                    ctx.json(Map.of("ok", true));
                  });
            })
        .start(7070);
  }
}
