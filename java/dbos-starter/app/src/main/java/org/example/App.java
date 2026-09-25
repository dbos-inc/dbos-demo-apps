package org.example;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.StartWorkflowOptions;
import dev.dbos.transact.config.DBOSConfig;
import dev.dbos.transact.workflow.ListWorkflowsInput;
import dev.dbos.transact.workflow.Queue;
import dev.dbos.transact.workflow.QueueConflictResolution;
import dev.dbos.transact.workflow.QueueOptions;
import dev.dbos.transact.workflow.Workflow;
import dev.dbos.transact.workflow.WorkflowSchedule;
import dev.dbos.transact.workflow.WorkflowState;
import dev.dbos.transact.workflow.WorkflowStatus;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import io.javalin.Javalin;
import io.javalin.http.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

interface DurableStarterService {
  void exampleWorkflow() throws InterruptedException;

  void scheduledWorkflow(Instant scheduledTime, Object context);

  void queueWorkflow();

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

  // ---- Queues tab: every sub-page enqueues this same workflow, each on its own queue,
  // so the differences you see come from the queues alone ----

  @Workflow
  @Override
  public void queueWorkflow() {
    dbos.sleep(Duration.ofSeconds(5));
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

    var decision = dbos.<String>recv(APPROVAL_TOPIC, Duration.ofSeconds(15)).orElse("");
    if (decision.equals("approve")) {
      dbos.setEvent(COMM_STATUS_EVENT, "step2");
      dbos.runStep(this::commStepTwo, "commStepTwo");
      dbos.setEvent(COMM_STATUS_EVENT, "completed");
    } else if (decision.equals("deny")) {
      dbos.setEvent(COMM_STATUS_EVENT, "denied");
      logger.info("Communication workflow: denied.");
    } else {
      // recv returns nothing on timeout. Throwing ends the workflow in the ERROR state.
      throw new RuntimeException("Timed out waiting for approval");
    }
  }
}

public class App {
  private static final Logger logger = LoggerFactory.getLogger(App.class);

  static final String SCHEDULE_NAME = "scheduled-workflow";
  static final String DEFAULT_CRON = "*/5 * * * * *";

  static final String QUEUE_NAME = "demo-queue";
  static final int DEFAULT_WORKER_CONCURRENCY = 3;

  static final String RATE_LIMITED_QUEUE_NAME = "rate-limited-queue";
  static final int DEFAULT_RATE_LIMIT = 2;
  static final Duration DEFAULT_RATE_PERIOD = Duration.ofSeconds(10);

  static final String FAIR_QUEUE_NAME = "fair-queue";
  static final int DEFAULT_PARTITION_CONCURRENCY = 1;
  static final int DEFAULT_FAIR_WORKER_CONCURRENCY = 4;
  // The tenants the frontend offers. The random mix draws from the first four,
  // leaving "ed" free to show a newcomer isn't stuck behind their backlog.
  static final List<String> FAIR_QUEUE_TENANTS = List.of("alice", "bob", "clark", "dave", "ed");

  static final String DELAYED_QUEUE_NAME = "delayed-queue";
  // The longest delay the demo accepts: one day. DBOS itself has no hard limit.
  static final int MAX_DELAY_SECONDS = 24 * 60 * 60;
  static final String DELAY_ERROR =
      "The delay must be a whole number of seconds from 1 to " + MAX_DELAY_SECONDS;

  // Count workflows grouped by status (matches the frontend summary panels).
  private static Map<String, Integer> countByStatus(List<WorkflowStatus> wfs) {
    var counts = new LinkedHashMap<String, Integer>();
    for (var wf : wfs) {
      counts.merge(wf.status().toString(), 1, Integer::sum);
    }
    return counts;
  }

  // Count workflows per tenant. Each workflow's partition key is its tenant.
  private static List<Map<String, Object>> countByTenant(List<WorkflowStatus> wfs) {
    var counts = new LinkedHashMap<String, Integer>();
    for (var wf : wfs) {
      counts.merge(Objects.requireNonNullElse(wf.queuePartitionKey(), "unknown"), 1, Integer::sum);
    }
    var rows = new ArrayList<Map<String, Object>>();
    counts.forEach((tenant, count) -> rows.add(Map.of("tenant_id", tenant, "count", count)));
    return rows;
  }

  private static Instant tenMinutesAgo() {
    return Instant.now().minus(Duration.ofMinutes(10));
  }

  // Workflows of the given name started in the last 10 minutes.
  private static List<WorkflowStatus> recentByName(DBOS dbos, String name) {
    return dbos.listWorkflows(
        new ListWorkflowsInput()
            .withWorkflowName(List.of(name))
            .withStartTime(tenMinutesAgo())
            .withLimit(500)
            .withLoadInput(false)
            .withLoadOutput(false));
  }

  // Workflows on the given queue started in the last 10 minutes, newest first.
  private static List<WorkflowStatus> recentOnQueue(DBOS dbos, String queueName) {
    return dbos.listWorkflows(
        new ListWorkflowsInput()
            .withQueueName(queueName)
            .withStartTime(tenMinutesAgo())
            .withSortDesc(true)
            .withLimit(500)
            .withLoadInput(false)
            .withLoadOutput(false));
  }

  // Workflows on the given queue in any of the given states, newest first.
  private static List<WorkflowStatus> onQueue(
      DBOS dbos, String queueName, WorkflowState... states) {
    return dbos.listWorkflows(
        new ListWorkflowsInput()
            .withQueueName(queueName)
            .withStatus(states)
            .withSortDesc(true)
            .withLoadInput(false)
            .withLoadOutput(false));
  }

  // The request's JSON body, or an empty map if it has none.
  private static Map<?, ?> body(Context ctx) {
    try {
      var body = ctx.bodyAsClass(Map.class);
      return body == null ? Map.of() : body;
    } catch (Exception e) {
      return Map.of();
    }
  }

  // Parse a request field (a JSON number or string) as an integer >= 1, or return null.
  private static Integer parsePositiveInt(Object value) {
    try {
      var n =
          value instanceof Number num
              ? num.doubleValue()
              : Double.parseDouble(String.valueOf(value).trim());
      return n >= 1 && n <= Integer.MAX_VALUE && n == Math.floor(n) ? (int) n : null;
    } catch (NumberFormatException e) {
      return null;
    }
  }

  // Parse a request field as a trimmed name of 1 to 40 characters, or return null.
  private static String parseName(Object value) {
    var s = value == null ? "" : value.toString().trim();
    return !s.isEmpty() && s.length() <= 40 ? s : null;
  }

  // Parse a request field as a whole number of seconds from 1 to MAX_DELAY_SECONDS, or return
  // null.
  private static Integer parseDelaySeconds(Object value) {
    var n = parsePositiveInt(value);
    return n != null && n <= MAX_DELAY_SECONDS ? n : null;
  }

  private static void error(Context ctx, int status, String message) {
    ctx.status(status).json(Map.of("error", message));
  }

  // Enqueue one workflow in the tenant's partition of the fair queue.
  private static void enqueueForTenant(DBOS dbos, DurableStarterService proxy, String tenantId) {
    dbos.startWorkflow(
        () -> proxy.queueWorkflow(),
        new StartWorkflowOptions().withQueue(FAIR_QUEUE_NAME).withQueuePartitionKey(tenantId));
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
                    // Register the demo queues (after launch). NEVER_UPDATE keeps any
                    // settings changed at runtime across restarts.
                    dbos.registerQueue(
                        QUEUE_NAME,
                        QueueOptions.setWorkerConcurrency(DEFAULT_WORKER_CONCURRENCY),
                        QueueConflictResolution.NEVER_UPDATE);
                    dbos.registerQueue(
                        RATE_LIMITED_QUEUE_NAME,
                        QueueOptions.setRateLimit(DEFAULT_RATE_LIMIT, DEFAULT_RATE_PERIOD),
                        QueueConflictResolution.NEVER_UPDATE);
                    dbos.registerQueue(
                        FAIR_QUEUE_NAME,
                        QueueOptions.setPartitionConcurrency(DEFAULT_PARTITION_CONCURRENCY)
                            .andWorkerConcurrency(DEFAULT_FAIR_WORKER_CONCURRENCY),
                        QueueConflictResolution.NEVER_UPDATE);
                    dbos.registerQueue(
                        DELAYED_QUEUE_NAME,
                        QueueOptions.empty(),
                        QueueConflictResolution.NEVER_UPDATE);
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

              // ---- Queues tab, worker concurrency: a queue with adjustable worker
              // concurrency ----
              config.routes.get(
                  "/queue/status",
                  ctx -> {
                    // findQueue reads the database-backed (dynamic) queue, so it
                    // reflects runtime concurrency changes; getQueue only sees
                    // statically-registered queues.
                    int workerConcurrency =
                        dbos.findQueue(QUEUE_NAME)
                            .map(Queue::workerConcurrency)
                            .orElse(DEFAULT_WORKER_CONCURRENCY);
                    var resp = new LinkedHashMap<String, Object>();
                    resp.put("worker_concurrency", workerConcurrency);
                    resp.put("workflow_counts", countByStatus(recentOnQueue(dbos, QUEUE_NAME)));
                    ctx.json(resp);
                  });
              config.routes.post(
                  "/queue/enqueue",
                  ctx -> {
                    dbos.startWorkflow(
                        () -> proxy.queueWorkflow(),
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

              // ---- Queues tab, rate limiting: a queue that starts at most `limit`
              // workflows every `period`. The rate limit can be changed at runtime. ----
              config.routes.get(
                  "/queue/rate/status",
                  ctx -> {
                    var rateLimit =
                        dbos.findQueue(RATE_LIMITED_QUEUE_NAME).map(Queue::rateLimit).orElse(null);
                    var wfs = recentOnQueue(dbos, RATE_LIMITED_QUEUE_NAME);
                    // The newest workflows. started_at is when the queue let each one start,
                    // so the gaps between start times show the rate limit at work.
                    var workflows = new ArrayList<Map<String, Object>>();
                    for (var wf : wfs.subList(0, Math.min(50, wfs.size()))) {
                      var row = new LinkedHashMap<String, Object>();
                      row.put("workflow_id", wf.workflowId());
                      row.put("status", wf.status().toString());
                      row.put("enqueued_at", wf.createdAtEpochMs());
                      row.put("started_at", wf.startedAtEpochMs());
                      workflows.add(row);
                    }
                    var resp = new LinkedHashMap<String, Object>();
                    resp.put(
                        "limit_per_period",
                        rateLimit != null ? rateLimit.limit() : DEFAULT_RATE_LIMIT);
                    resp.put(
                        "period_sec",
                        (rateLimit != null ? rateLimit.period() : DEFAULT_RATE_PERIOD).toSeconds());
                    resp.put("workflow_counts", countByStatus(wfs));
                    resp.put("workflows", workflows);
                    ctx.json(resp);
                  });
              config.routes.post(
                  "/queue/rate/enqueue",
                  ctx -> {
                    dbos.startWorkflow(
                        () -> proxy.queueWorkflow(),
                        new StartWorkflowOptions().withQueue(RATE_LIMITED_QUEUE_NAME));
                    ctx.json(Map.of("ok", true));
                  });
              config.routes.post(
                  "/queue/rate/limit",
                  ctx -> {
                    var body = body(ctx);
                    var limit = parsePositiveInt(body.get("limit_per_period"));
                    var periodSec = parsePositiveInt(body.get("period_sec"));
                    if (limit == null || periodSec == null) {
                      error(ctx, 400, "The limit and period must be whole numbers of at least 1");
                      return;
                    }
                    dbos.updateQueue(
                        RATE_LIMITED_QUEUE_NAME,
                        QueueOptions.setRateLimit(limit, Duration.ofSeconds(periodSec)));
                    ctx.json(Map.of("ok", true));
                  });

              // ---- Queues tab, fair queues: a queue partitioned by tenant.
              // partitionConcurrency limits how many workflows each tenant runs at once,
              // and workerConcurrency limits how many run on this process in total,
              // so one busy tenant can't starve the others.
              // Both limits can be changed at runtime. ----
              config.routes.get(
                  "/queue/fair/status",
                  ctx -> {
                    var queue = dbos.findQueue(FAIR_QUEUE_NAME);
                    var pending = new ArrayList<Map<String, Object>>();
                    for (var wf : onQueue(dbos, FAIR_QUEUE_NAME, WorkflowState.PENDING)) {
                      pending.add(
                          Map.of(
                              "workflow_id",
                              wf.workflowId(),
                              "tenant_id",
                              Objects.requireNonNullElse(wf.queuePartitionKey(), "unknown")));
                    }
                    var success =
                        dbos.listWorkflows(
                            new ListWorkflowsInput()
                                .withQueueName(FAIR_QUEUE_NAME)
                                .withStatus(WorkflowState.SUCCESS)
                                .withStartTime(tenMinutesAgo())
                                .withLoadInput(false)
                                .withLoadOutput(false));
                    var resp = new LinkedHashMap<String, Object>();
                    resp.put(
                        "partition_concurrency",
                        queue
                            .map(Queue::partitionConcurrency)
                            .orElse(DEFAULT_PARTITION_CONCURRENCY));
                    resp.put(
                        "worker_concurrency",
                        queue
                            .map(Queue::workerConcurrency)
                            .orElse(DEFAULT_FAIR_WORKER_CONCURRENCY));
                    resp.put(
                        "enqueued",
                        countByTenant(onQueue(dbos, FAIR_QUEUE_NAME, WorkflowState.ENQUEUED)));
                    resp.put("pending", pending);
                    resp.put("success", countByTenant(success));
                    ctx.json(resp);
                  });
              config.routes.post(
                  "/queue/fair/enqueue",
                  ctx -> {
                    var tenantId = parseName(body(ctx).get("tenant_id"));
                    if (tenantId == null) {
                      error(ctx, 400, "Tenant names must be 1 to 40 characters");
                      return;
                    }
                    enqueueForTenant(dbos, proxy, tenantId);
                    ctx.json(Map.of("ok", true));
                  });
              // Enqueue a batch of workflows across four tenants, skewed toward one of them.
              config.routes.post(
                  "/queue/fair/random_mix",
                  ctx -> {
                    var total = 50;
                    var random = ThreadLocalRandom.current();
                    var tenants = FAIR_QUEUE_TENANTS.subList(0, 4);
                    var favored = tenants.get(random.nextInt(tenants.size()));
                    // The favored tenant is twice as likely to be picked. Picks are made one
                    // at a time, so the workflows arrive in randomized order.
                    var weighted = new ArrayList<>(tenants);
                    weighted.add(favored);
                    for (var i = 0; i < total; i++) {
                      enqueueForTenant(dbos, proxy, weighted.get(random.nextInt(weighted.size())));
                      Thread.sleep(10);
                    }
                    ctx.json(Map.of("total", total, "favored", favored));
                  });
              config.routes.post(
                  "/queue/fair/limits",
                  ctx -> {
                    var body = body(ctx);
                    var partitionConcurrency = parsePositiveInt(body.get("partition_concurrency"));
                    var workerConcurrency = parsePositiveInt(body.get("worker_concurrency"));
                    if (partitionConcurrency == null || workerConcurrency == null) {
                      error(
                          ctx,
                          400,
                          "partitionConcurrency and workerConcurrency must be whole numbers of"
                              + " at least 1");
                      return;
                    }
                    dbos.updateQueue(
                        FAIR_QUEUE_NAME,
                        QueueOptions.setPartitionConcurrency(partitionConcurrency)
                            .andWorkerConcurrency(workerConcurrency));
                    ctx.json(Map.of("ok", true));
                  });

              // ---- Queues tab, delays: enqueue a workflow that waits before running.
              // The workflow stays DELAYED until its delay expires, then becomes ENQUEUED
              // and runs. While it's DELAYED, its delay can be changed to run it sooner or
              // later. The delay is stored in the database, so it survives restarts. ----
              config.routes.get(
                  "/queue/delay/status",
                  ctx -> {
                    // List every workflow still in progress, plus any created in the last
                    // 10 minutes.
                    var byId = new LinkedHashMap<String, WorkflowStatus>();
                    for (var wf : recentOnQueue(dbos, DELAYED_QUEUE_NAME)) {
                      byId.put(wf.workflowId(), wf);
                    }
                    for (var wf :
                        onQueue(
                            dbos,
                            DELAYED_QUEUE_NAME,
                            WorkflowState.DELAYED,
                            WorkflowState.ENQUEUED,
                            WorkflowState.PENDING)) {
                      byId.put(wf.workflowId(), wf);
                    }
                    var workflows =
                        byId.values().stream()
                            .sorted(
                                Comparator.comparing(
                                    (WorkflowStatus wf) ->
                                        Objects.requireNonNullElse(wf.createdAtEpochMs(), 0L),
                                    Comparator.reverseOrder()))
                            .limit(50)
                            .map(
                                wf -> {
                                  var row = new LinkedHashMap<String, Object>();
                                  row.put("workflow_id", wf.workflowId());
                                  row.put("status", wf.status().toString());
                                  row.put("enqueued_at", wf.createdAtEpochMs());
                                  // When the delay expires and the workflow becomes
                                  // eligible to run.
                                  row.put("due_at", wf.delayUntilEpochMs());
                                  return row;
                                })
                            .toList();
                    ctx.json(Map.of("workflows", workflows));
                  });
              config.routes.post(
                  "/queue/delay/enqueue",
                  ctx -> {
                    var delaySeconds = parseDelaySeconds(body(ctx).get("delay_seconds"));
                    if (delaySeconds == null) {
                      error(ctx, 400, DELAY_ERROR);
                      return;
                    }
                    dbos.startWorkflow(
                        () -> proxy.queueWorkflow(),
                        new StartWorkflowOptions()
                            .withQueue(DELAYED_QUEUE_NAME)
                            .withDelay(Duration.ofSeconds(delaySeconds)));
                    ctx.json(Map.of("ok", true));
                  });
              // Change a workflow's delay, counting from now. DBOS only changes the delay
              // of a workflow that is still DELAYED.
              config.routes.post(
                  "/queue/delay/set/{workflowId}",
                  ctx -> {
                    var workflowId = ctx.pathParam("workflowId");
                    var delaySeconds = parseDelaySeconds(body(ctx).get("delay_seconds"));
                    if (delaySeconds == null) {
                      error(ctx, 400, DELAY_ERROR);
                      return;
                    }
                    var status = dbos.getWorkflowStatus(workflowId);
                    if (status.isEmpty()
                        || !DELAYED_QUEUE_NAME.equals(status.get().queueName())) {
                      error(ctx, 404, "Delayed workflow not found");
                      return;
                    }
                    if (status.get().status() != WorkflowState.DELAYED) {
                      error(
                          ctx,
                          409,
                          "The workflow is "
                              + status.get().status()
                              + ", so its delay can no longer change");
                      return;
                    }
                    dbos.setWorkflowDelay(workflowId, Duration.ofSeconds(delaySeconds));
                    ctx.json(Map.of("ok", true));
                  });

              // ---- Communication endpoints ----
              config.routes.get(
                  "/comm/status/{workflowId}",
                  ctx -> {
                    var wfId = ctx.pathParam("workflowId");
                    // The workflow throws when it times out waiting for approval, so it ends
                    // in ERROR.
                    var wf = dbos.getWorkflowStatus(wfId);
                    if (wf.isPresent() && wf.get().status() == WorkflowState.ERROR) {
                      var error = wf.get().error();
                      var message =
                          error != null ? Objects.requireNonNullElse(error.message(), "") : "";
                      ctx.json(Map.of("state", "timeout", "error", message));
                      return;
                    }
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
