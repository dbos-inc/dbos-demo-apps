package org.example;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.StartWorkflowOptions;
import dev.dbos.transact.config.DBOSConfig;
import dev.dbos.transact.workflow.ListWorkflowsInput;
import dev.dbos.transact.workflow.QueueOptions;
import dev.dbos.transact.workflow.Workflow;
import dev.dbos.transact.workflow.WorkflowState;
import dev.dbos.transact.workflow.WorkflowStatus;
import dev.dbos.transact.workflow.internal.DebouncerMessage;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;

import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

interface QueuePatternsService {
  void fairQueueWorkflow();

  void fairQueueConcurrencyManager();

  void rateLimitedQueueWorkflow();

  void debouncerWorkflow(String tenantId, String input);
}

class QueuePatternsServiceImpl implements QueuePatternsService {

  private static final Logger logger = LoggerFactory.getLogger(QueuePatternsServiceImpl.class);

  private final DBOS dbos;
  private QueuePatternsService proxy;

  public QueuePatternsServiceImpl(DBOS dbos) {
    this.dbos = dbos;
  }

  // The proxy is what routes calls through DBOS, so the manager workflow uses it to
  // enqueue its child rather than calling the method directly.
  public void setProxy(QueuePatternsService proxy) {
    this.proxy = proxy;
  }

  // ---- Fair Queueing ----

  // The workflow for fair queueing simply sleeps for 5 seconds.
  @Workflow(name = "fair_queue_workflow")
  @Override
  public void fairQueueWorkflow() {
    dbos.sleep(Duration.ofSeconds(5));
  }

  // The fair queue example uses two queues:
  // PARTITIONED_QUEUE is split by tenant ID and limits the total number of concurrent tasks per
  // tenant.
  // CONCURRENCY_QUEUE limits the number of concurrent tasks per worker.
  // These are registered in main().
  // Workflows are first enqueued on the former and then to the latter, thus applying the limits of
  // both queues.
  @Workflow(name = "fair_queue_concurrency_manager")
  @Override
  public void fairQueueConcurrencyManager() {
    // This "concurrency manager" workflow holds a slot on PARTITIONED_QUEUE and executes
    // fairQueueWorkflow on the CONCURRENCY_QUEUE.
    var handle =
        dbos.startWorkflow(
            () -> proxy.fairQueueWorkflow(),
            new StartWorkflowOptions().withQueue(App.CONCURRENCY_QUEUE));
    handle.getResult();
  }

  // ---- Rate Limiting ----

  // This workflow is rate-limited: No more than two workflows can start per 10 seconds.
  // See RATE_LIMITED_QUEUE in main().
  @Workflow(name = "rate_limited_queue_workflow")
  @Override
  public void rateLimitedQueueWorkflow() {
    dbos.sleep(Duration.ofSeconds(5));
  }

  // ---- Debouncing ----

  @Workflow(name = "debouncer_workflow")
  @Override
  public void debouncerWorkflow(String tenantId, String input) {
    logger.info("Executing debounced workflow for tenant {} with input {}", tenantId, input);
    dbos.sleep(Duration.ofSeconds(5));
  }
}

public class App {

  private static final Logger logger = LoggerFactory.getLogger(App.class);

  static final String CONCURRENCY_QUEUE = "concurrency-queue";
  static final String PARTITIONED_QUEUE = "partitioned-queue";
  static final String RATE_LIMITED_QUEUE = "rate-limited-queue";
  static final String DEBOUNCER_QUEUE = "debouncer-queue";

  // The set of tenants the UI offers and the randomized batch draws from.
  static final List<String> FAIR_QUEUE_TENANTS = List.of("alice", "bob", "clark", "dave", "ed");

  private static final Random random = new Random();

  private static Instant thirtyMinutesAgo() {
    return Instant.now().minus(Duration.ofMinutes(30));
  }

  private static Long epochMillis(Instant instant) {
    return instant == null ? null : instant.toEpochMilli();
  }

  // Enqueue a single "concurrency manager" workflow to PARTITIONED_QUEUE
  private static void enqueueForTenant(DBOS dbos, QueuePatternsService proxy, String tenantId) {
    dbos.startWorkflow(
        () -> proxy.fairQueueConcurrencyManager(),
        new StartWorkflowOptions().withQueue(PARTITIONED_QUEUE).withQueuePartitionKey(tenantId));
  }

  private static List<WorkflowStatus> listByStatus(
      DBOS dbos, String name, List<WorkflowState> states, boolean loadInput) {
    return dbos.listWorkflows(
        new ListWorkflowsInput()
            .withWorkflowName(List.of(name))
            .withStatus(states)
            .withSortDesc(true)
            .withLoadInput(loadInput)
            .withLoadOutput(false));
  }

  private static List<Map<String, Object>> countsByTenant(List<WorkflowStatus> workflows) {
    var counts = new LinkedHashMap<String, Integer>();
    for (var w : workflows) {
      var tenant = w.queuePartitionKey() == null ? "unknown" : w.queuePartitionKey();
      counts.merge(tenant, 1, Integer::sum);
    }
    var rows = new ArrayList<Map<String, Object>>();
    counts.forEach((tenant, count) -> rows.add(Map.of("tenant_id", tenant, "count", count)));
    return rows;
  }

  // The debounced workflow's arguments are (tenantId, input).
  private static String argAt(WorkflowStatus w, int index) {
    var input = w.input();
    if (input == null || input.length <= index || input[index] == null) {
      return null;
    }
    return String.valueOf(input[index]);
  }

  // A row of the debouncer pipeline: the tenant and the input it is carrying.
  private static Map<String, Object> debounceItem(WorkflowStatus w) {
    var item = new LinkedHashMap<String, Object>();
    var tenant = argAt(w, 0);
    item.put("workflow_id", w.workflowId());
    item.put("tenant_id", tenant == null ? "unknown" : tenant);
    item.put("input", Objects.requireNonNullElse(argAt(w, 1), ""));
    item.put("start_time", w.createdAtEpochMs());
    // For DELAYED workflows this is when the debounce window closes and the workflow
    // will run; null once it has left DELAYED.
    item.put("delay_until", w.delayUntilEpochMs());
    // When the workflow actually started running (it left the debounce window), which
    // is what the completed list sorts by.
    item.put("ran_at", Objects.requireNonNullElse(w.startedAtEpochMs(), w.createdAtEpochMs()));
    return item;
  }

  // ---- The "waiting to debounce" list ----
  //
  // The Java debouncer coalesces inside an internal "waiter" workflow: the first call
  // enqueues it on the SDK's internal queue holding "<workflowName>-<key>" as its
  // deduplication ID, and later calls send it the new input. The debounced workflow
  // itself is not created until the window closes. We use the waiter workflow to monitor
  // workflows due to start.
  private static final String INTERNAL_QUEUE = "_dbos_internal_queue";
  private static final String DEBOUNCE_WAITER_NAME = "debouncerWorkflow";
  private static final String DEBOUNCE_WAITER_CLASS = "DBOS.InternalWorkflows";
  private static final String DEBOUNCE_KEY_PREFIX = "debouncer_workflow-";

  private static String messageArg(Object candidate, int index) {
    if (candidate instanceof DebouncerMessage message) {
      var args = message.args();
      if (args != null && args.length > index && args[index] != null) {
        return String.valueOf(args[index]);
      }
    }
    return null;
  }

  private static List<Map<String, Object>> delayedDebounces(DBOS dbos) {
    // Search for the special "debouncer" workflow
    var waiters =
        dbos.listWorkflows(
            new ListWorkflowsInput()
                .withWorkflowName(List.of(DEBOUNCE_WAITER_NAME))
                .withClassName(DEBOUNCE_WAITER_CLASS)
                .withQueueName(List.of(INTERNAL_QUEUE))
                .withStatus(List.of(WorkflowState.PENDING))
                .withLoadInput(true)
                .withLoadOutput(false));

    var now = System.currentTimeMillis();
    var rows = new ArrayList<Map<String, Object>>();
    for (var waiter : waiters) {
      var dedupId = waiter.deduplicationId();
      if (dedupId == null || !dedupId.startsWith(DEBOUNCE_KEY_PREFIX)) {
        continue; // not a debounce of this app's workflow
      }
      var tenant = dedupId.substring(DEBOUNCE_KEY_PREFIX.length());

      // The input the waiter started with, before any further calls replaced it.
      String input = null;
      if (waiter.input() != null) {
        for (var arg : waiter.input()) {
          var candidate = messageArg(arg, 1);
          if (candidate != null) {
            input = candidate;
          }
        }
      }

      //locate the last "sleep" step and use its deadline to determine when the debounce window closes
      Long deadline = null;
      for (var step : dbos.listWorkflowSteps(waiter.workflowId())) {
        if ("DBOS.sleep".equals(step.functionName()) && step.output() instanceof Long wakeAt) {
          deadline = wakeAt;
        } else {
          var received = messageArg(step.output(), 1);
          if (received != null) {
            input = received;
          }
        }
      }

      if (deadline == null || deadline <= now) {
        continue; // window already closed; the workflow shows up as pending/completed
      }

      var row = new LinkedHashMap<String, Object>();
      row.put("workflow_id", waiter.workflowId());
      row.put("tenant_id", tenant);
      row.put("input", Objects.requireNonNullElse(input, ""));
      row.put("start_time", waiter.createdAtEpochMs());
      row.put("delay_until", deadline);
      row.put("ran_at", deadline);
      rows.add(row);
    }
    rows.sort((a, b) -> ((String) a.get("tenant_id")).compareTo((String) b.get("tenant_id")));
    return rows;
  }

  private static List<Map<String, Object>> debounceItems(List<WorkflowStatus> workflows) {
    var items = new ArrayList<Map<String, Object>>();
    for (var w : workflows) {
      items.add(debounceItem(w));
    }
    return items;
  }

  public static void main(String[] args) {
    var dbUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
    if (dbUrl == null || dbUrl.isEmpty()) {
      dbUrl = "jdbc:postgresql://localhost:5432/dbos_queue_patterns_java";
    }
    var dbUser = Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres");
    var dbPassword = Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos");

    var dbosConfig =
        DBOSConfig.defaults("dbos-queue-patterns")
            .withDatabaseUrl(dbUrl)
            .withDbUser(dbUser)
            .withDbPassword(dbPassword)
            .withConductorKey(System.getenv("DBOS_CONDUCTOR_KEY"))
            .withAppVersion("0.1.0");

    var dbos = new DBOS(dbosConfig);

    var impl = new QueuePatternsServiceImpl(dbos);
    var proxy = dbos.registerProxy(QueuePatternsService.class, impl);
    impl.setProxy(proxy);

    Javalin.create(
            config -> {
              config.startup.showJavalinBanner = false;
              // Serve the built frontend
              config.staticFiles.add("frontend/dist", Location.EXTERNAL);

              config.events.serverStarting(
                  () -> {
                    dbos.launch();
                    dbos.registerQueue(CONCURRENCY_QUEUE, QueueOptions.setWorkerConcurrency(4));
                    dbos.registerQueue(
                        PARTITIONED_QUEUE, QueueOptions.setPartitionQueue(true).andConcurrency(2));
                    dbos.registerQueue(
                        RATE_LIMITED_QUEUE, QueueOptions.setRateLimit(2, Duration.ofSeconds(10)));
                    dbos.registerQueue(DEBOUNCER_QUEUE, QueueOptions.empty());
                  });
              config.events.serverStopping(dbos::shutdown);

              // ---- Fair Queueing ----

              // Handler for single-workflow enqueue
              config.routes.post(
                  "/api/workflows/fair_queue",
                  ctx -> {
                    var tenantId = Objects.requireNonNullElse(ctx.queryParam("tenant_id"), "");
                    enqueueForTenant(dbos, proxy, tenantId);
                    ctx.status(200);
                  });

              // Enqueue a randomized mix of workflows
              config.routes.post(
                  "/api/workflows/fair_queue/random_mix",
                  ctx -> {
                    var total = 50;
                    var tenants = FAIR_QUEUE_TENANTS.subList(0, 4);
                    var favored = tenants.get(random.nextInt(tenants.size()));
                    // The favored tenant is twice as likely to be picked, so the batch is
                    // skewed toward it. Picks are made one at a time, so they arrive in
                    // randomized order.
                    var weighted = new ArrayList<String>();
                    for (var t : tenants) {
                      weighted.add(t);
                      if (t.equals(favored)) {
                        weighted.add(t);
                      }
                    }
                    for (var i = 0; i < total; i++) {
                      enqueueForTenant(dbos, proxy, weighted.get(random.nextInt(weighted.size())));
                      Thread.sleep(10);
                    }
                    ctx.json(Map.of("total", total, "favored", favored));
                  });

              // ---- Rate Limiting ----

              config.routes.post(
                  "/api/workflows/rate_limited_queue",
                  ctx -> {
                    dbos.startWorkflow(
                        () -> proxy.rateLimitedQueueWorkflow(),
                        new StartWorkflowOptions().withQueue(RATE_LIMITED_QUEUE));
                    ctx.status(200);
                  });

              // ---- Debouncing ----

              config.routes.post(
                  "/api/workflows/debouncer",
                  ctx -> {
                    var tenantId = Objects.requireNonNullElse(ctx.queryParam("tenant_id"), "");
                    var input = Objects.requireNonNullElse(ctx.queryParam("input"), "");
                    // Each time a new input is submitted for a tenant, debounce
                    // debouncerWorkflow. The debouncer waits until 10 seconds after input
                    // stops being submitted for the tenant, then enqueues the workflow with
                    // the last input submitted.
                    var debounceKey = tenantId;
                    var debouncePeriod = Duration.ofSeconds(10);
                    dbos.debouncer()
                        .withQueue(DEBOUNCER_QUEUE)
                        .debounce(
                            debounceKey,
                            debouncePeriod,
                            () -> proxy.debouncerWorkflow(tenantId, input));
                    ctx.status(200);
                  });

              // ---- Observability ----

              config.routes.get(
                  "/api/workflows",
                  ctx -> {
                    var workflowName =
                        Objects.requireNonNullElse(ctx.queryParam("workflow_name"), "");
                    var workflows =
                        dbos.listWorkflows(
                            new ListWorkflowsInput()
                                .withWorkflowName(List.of(workflowName))
                                .withSortDesc(true)
                                .withLoadInput(true)
                                .withLoadOutput(false));
                    var statuses = new ArrayList<Map<String, Object>>();
                    for (var w : workflows) {
                      var row = new LinkedHashMap<String, Object>();
                      row.put("workflow_id", w.workflowId());
                      row.put("workflow_status", w.status().name());
                      row.put("workflow_name", w.workflowName());
                      row.put("start_time", w.createdAtEpochMs());
                      if (workflowName.contains("fair_queue")) {
                        row.put("tenant_id", w.queuePartitionKey());
                        row.put("input", null);
                      } else if (workflowName.contains("debouncer")) {
                        row.put("tenant_id", argAt(w, 0));
                        row.put("input", argAt(w, 1));
                      } else {
                        row.put("tenant_id", null);
                        row.put("input", null);
                      }
                      statuses.add(row);
                    }
                    ctx.json(statuses);
                  });

              config.routes.get(
                  "/api/fair_queue/pipeline",
                  ctx -> {
                    // The "concurrency manager" workflows run on the partitioned queue and
                    // carry the partition key (tenant_id) natively.
                    var enqueuedMgrs =
                        listByStatus(
                            dbos,
                            "fair_queue_concurrency_manager",
                            List.of(WorkflowState.ENQUEUED, WorkflowState.PENDING),
                            false);
                    var successMgrs =
                        dbos.listWorkflows(
                            new ListWorkflowsInput()
                                .withWorkflowName(List.of("fair_queue_concurrency_manager"))
                                .withStatus(List.of(WorkflowState.SUCCESS))
                                .withStartTime(thirtyMinutesAgo())
                                .withLoadInput(false)
                                .withLoadOutput(false));

                    // The actual work runs on the concurrency queue. Those workflows have no
                    // partition key of their own, so we inherit it from the parent manager
                    // that enqueued them.
                    var pendingWork =
                        listByStatus(
                            dbos, "fair_queue_workflow", List.of(WorkflowState.PENDING), false);
                    var mgrKey = new LinkedHashMap<String, String>();
                    for (var m : enqueuedMgrs) {
                      mgrKey.put(m.workflowId(), m.queuePartitionKey());
                    }

                    var pendingConcurrency = new ArrayList<Map<String, Object>>();
                    for (var w : pendingWork) {
                      var tenant = mgrKey.get(w.parentWorkflowId());
                      pendingConcurrency.add(
                          Map.of(
                              "workflow_id",
                              w.workflowId(),
                              "tenant_id",
                              tenant == null ? "unknown" : tenant));
                    }

                    var resp = new LinkedHashMap<String, Object>();
                    resp.put("enqueued", countsByTenant(enqueuedMgrs));
                    resp.put("pending_concurrency", pendingConcurrency);
                    resp.put("success", countsByTenant(successMgrs));
                    ctx.json(resp);
                  });

              config.routes.get(
                  "/api/debouncer/pipeline",
                  ctx -> {
                    // A debounced workflow waits out its window, then runs (PENDING) and
                    // completes (SUCCESS). We surface the tenant and its latest input for
                    // each stage. Deduplication on the tenant key means there is at most one
                    // debounce waiting per tenant -- i.e. the last input submitted wins.
                    var delayed = delayedDebounces(dbos);
                    var pending =
                        listByStatus(
                            dbos, "debouncer_workflow", List.of(WorkflowState.PENDING), true);
                    var completed =
                        dbos.listWorkflows(
                            new ListWorkflowsInput()
                                .withWorkflowName(List.of("debouncer_workflow"))
                                .withStatus(List.of(WorkflowState.SUCCESS))
                                .withStartTime(thirtyMinutesAgo())
                                .withSortDesc(true)
                                .withLoadInput(true)
                                .withLoadOutput(false));

                    var resp = new LinkedHashMap<String, Object>();
                    resp.put("delayed", delayed);
                    resp.put("pending", debounceItems(pending));
                    resp.put("completed", debounceItems(completed));
                    ctx.json(resp);
                  });
            })
        .start(8000);

    logger.info("Server starting on http://localhost:8000");
  }
}
