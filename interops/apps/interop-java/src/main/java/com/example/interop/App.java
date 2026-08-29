/*
 * DBOS Java interop app.
 *
 * Registers echoWorkflow as a configured instance method (class=interop,
 * instance="default") on interop-queue-java.
 *
 * POST /enqueue/{target}       — accepts a {positionalArgs, namedArgs} body, enqueues
 *                                echoWorkflow onto interop-queue-{target}, returns its result.
 * POST /interop/{target}       — the same call, returning {result, parentId, childId} so the
 *                                caller can inspect the cross-application parent/child link.
 * POST /enqueue-async/{target} — enqueue without waiting, optionally naming a different owner.
 * GET  /workflow/{id}          — status of any workflow in the shared system database.
 * GET  /workflows              — workflows this application owns, or a named peer's.
 * GET  /steps/{id}             — the recorded steps of a workflow, with child workflow IDs.
 * GET  /healthz                — liveness probe.
 */
package com.example.interop;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.DBOSClient.EnqueueOptions;
import dev.dbos.transact.config.DBOSConfig;
import dev.dbos.transact.workflow.ListWorkflowsInput;
import dev.dbos.transact.workflow.Queue;
import dev.dbos.transact.workflow.SerializationStrategy;
import dev.dbos.transact.workflow.Workflow;
import dev.dbos.transact.workflow.WorkflowClassName;

import java.time.Duration;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import io.javalin.Javalin;

interface InteropService {
  Map<String, Object> echoWorkflow(
      String text, int num, double floatVal, List<String> items, String date);
}

@WorkflowClassName("interop")
class InteropServiceImpl implements InteropService {

  private final DBOS dbos;

  public InteropServiceImpl(DBOS dbos) {
    this.dbos = dbos;
  }

  @Override
  @Workflow(name = "echoWorkflow", serializationStrategy = SerializationStrategy.PORTABLE)
  public Map<String, Object> echoWorkflow(
      String text, int num, double floatVal, List<String> items, String date) {
    String msgDateRaw = (String) dbos.recv("date-msg", Duration.ofSeconds(30)).orElse(null);
    String msgDate = msgDateRaw.length() > 10 ? msgDateRaw.substring(0, 10) : msgDateRaw;

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("echo_text", text);
    result.put("echo_num", num);
    result.put("echo_float", floatVal);
    result.put("items_count", items.size());
    result.put("echo_date", date);
    result.put("msg_date", msgDate);
    return result;
  }
}

interface InteropDriver {
  Map<String, Object> interopDriver(
      String target, List<Object> positionalArgs, Map<String, Object> namedArgs);
}

/**
 * Enqueue another application's echoWorkflow and wait for its result.
 *
 * <p>This runs inside a workflow and enqueues through the runtime itself — no DBOS client — so the
 * enqueued workflow is recorded as a child of this one even though a different application owns and
 * runs it.
 */
class InteropDriverImpl implements InteropDriver {

  private final DBOS dbos;

  InteropDriverImpl(DBOS dbos) {
    this.dbos = dbos;
  }

  @Override
  @Workflow(name = "interopDriver")
  public Map<String, Object> interopDriver(
      String target, List<Object> positionalArgs, Map<String, Object> namedArgs) {
    var handle =
        dbos.<Map<String, Object>>enqueuePortableWorkflow(
            App.enqueueOptions(target, target),
            positionalArgs.toArray(),
            namedArgs.isEmpty() ? null : namedArgs);
    String childId = handle.workflowId();

    // Send the date message the child workflow is waiting on. Workflow IDs are
    // unique across the whole system database, so this reaches the child no
    // matter which application runs it.
    dbos.send(childId, LocalDate.of(2025, 3, 15), "date-msg", null, SerializationStrategy.PORTABLE);

    Map<String, Object> envelope = new LinkedHashMap<>();
    envelope.put("result", handle.getResult());
    envelope.put("parentId", DBOS.workflowId());
    envelope.put("childId", childId);
    return envelope;
  }
}

public class App {

  private static final Map<String, String> QUEUE_NAMES =
      Map.of(
          "python", "interop-queue-python",
          "typescript", "interop-queue-typescript",
          "go", "interop-queue-go",
          "java", "interop-queue-java");

  // All four runtimes share one system database, so each is a distinct DBOS
  // application. An application's name decides what it owns — its workflows,
  // queues and versions — and it only runs its own work.
  private static final Map<String, String> APP_NAMES =
      Map.of(
          "python", "interop-python",
          "typescript", "interop-typescript",
          "go", "interop-go",
          "java", "interop-java");

  // Application version names are unique across every application sharing a
  // system database, so each runtime carries its own rather than a common
  // "interop-v1", and an enqueue targets the version of the runtime that will
  // run the workflow.
  private static final Map<String, String> APP_VERSIONS =
      Map.of(
          "python", "interop-python-v1",
          "typescript", "interop-typescript-v1",
          "go", "interop-go-v1",
          "java", "interop-java-v1");

  // This application's own name. Overridable so the demo can rename the
  // application and re-own its rows with `dbosctl sysdb rename-application`;
  // everything this process owns is keyed by whatever this resolves to.
  private static String appName() {
    var override = System.getenv("INTEROP_APP_NAME");
    return override == null || override.isBlank() ? APP_NAMES.get("java") : override;
  }

  // The application name to hand a workflow to. For every language but this one
  // that is the fixed name in APP_NAMES; for "java" it is whatever this process
  // is currently called, which a rename can have moved away from "interop-java".
  private static String appNameOf(String owner) {
    return "java".equals(owner) ? appName() : APP_NAMES.get(owner);
  }

  /**
   * Options describing {@code target}'s echoWorkflow.
   *
   * <p>{@code owner} is the application handed the workflow; it is {@code target} unless the caller
   * is deliberately handing it to an application that does not poll this queue. The version is
   * always the target's, so ownership is the only thing that can keep it from being dequeued.
   */
  static EnqueueOptions enqueueOptions(String target, String owner) {
    return new EnqueueOptions("echoWorkflow", "interop", QUEUE_NAMES.get(target))
        .withInstanceName("default")
        .withSerialization(SerializationStrategy.PORTABLE)
        .withTimeout(Duration.ofSeconds(30))
        .withApplicationName(appNameOf(owner))
        .withAppVersion(APP_VERSIONS.get(target));
  }

  @SuppressWarnings("unchecked")
  private static List<Object> positionalArgs(Map<String, Object> payload) {
    return (List<Object>) payload.getOrDefault("positionalArgs", List.of());
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> namedArgs(Map<String, Object> payload) {
    return (Map<String, Object>) payload.getOrDefault("namedArgs", Map.of());
  }

  public static void main(String[] args) {
    String jdbcUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
    if (jdbcUrl == null || jdbcUrl.isBlank()) {
      jdbcUrl = "jdbc:postgresql://localhost:5432/interop_dbos_sys";
    }

    var dbosConfig =
        DBOSConfig.defaults(appName())
            .withDatabaseUrl(jdbcUrl)
            .withDbUser(Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres"))
            .withDbPassword(Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos"))
            .withAppVersion(APP_VERSIONS.get("java"))
            // Only serve our own queue: a queue this application does not own is
            // polled by every application sharing the system database.
            .withListenQueue(QUEUE_NAMES.get("java"));

    var dbos = new DBOS(dbosConfig);

    dbos.registerProxy(InteropService.class, new InteropServiceImpl(dbos), "default");
    var driver = dbos.registerProxy(InteropDriver.class, new InteropDriverImpl(dbos));
    dbos.registerQueue(new Queue(QUEUE_NAMES.get("java")));

    var app =
        Javalin.create(
            config -> {
              config.startup.showJavalinBanner = false;
              config.events.serverStarting(() -> dbos.launch());
              config.events.serverStopping(() -> dbos.shutdown());

              config.routes.get("/healthz", ctx -> ctx.json(Map.of("status", "ok")));

              config.routes.post(
                  "/enqueue/{target}",
                  ctx -> {
                    var target = ctx.pathParam("target");
                    if (!QUEUE_NAMES.containsKey(target)) {
                      ctx.status(400).result("unknown target: " + target);
                      return;
                    }
                    @SuppressWarnings("unchecked")
                    Map<String, Object> payload = ctx.bodyAsClass(Map.class);
                    var envelope =
                        driver.interopDriver(target, positionalArgs(payload), namedArgs(payload));
                    ctx.json(envelope.get("result"));
                  });

              config.routes.post(
                  "/interop/{target}",
                  ctx -> {
                    var target = ctx.pathParam("target");
                    if (!QUEUE_NAMES.containsKey(target)) {
                      ctx.status(400).result("unknown target: " + target);
                      return;
                    }
                    @SuppressWarnings("unchecked")
                    Map<String, Object> payload = ctx.bodyAsClass(Map.class);
                    ctx.json(
                        driver.interopDriver(target, positionalArgs(payload), namedArgs(payload)));
                  });

              // Enqueue onto {target}'s queue without waiting for the result.
              //
              // `owner` defaults to {target}, so the application that polls the
              // queue is also the one that owns the workflow. Naming a different
              // application hands the workflow to one that isn't polling this
              // queue — nobody runs it, which is what makes ownership visible as
              // its own gate on dequeue.
              config.routes.post(
                  "/enqueue-async/{target}",
                  ctx -> {
                    var target = ctx.pathParam("target");
                    var owner = Objects.requireNonNullElse(ctx.queryParam("owner"), target);
                    if (!QUEUE_NAMES.containsKey(target)) {
                      ctx.status(400).result("unknown target: " + target);
                      return;
                    }
                    if (!APP_NAMES.containsKey(owner)) {
                      ctx.status(400).result("unknown owner: " + owner);
                      return;
                    }
                    @SuppressWarnings("unchecked")
                    Map<String, Object> payload = ctx.bodyAsClass(Map.class);
                    var named = namedArgs(payload);

                    var handle =
                        dbos.<Map<String, Object>>enqueuePortableWorkflow(
                            enqueueOptions(target, owner),
                            positionalArgs(payload).toArray(),
                            named.isEmpty() ? null : named);

                    // Send the date message echoWorkflow waits on, so a workflow
                    // that does get dequeued runs to completion rather than
                    // timing out in recv.
                    dbos.send(
                        handle.workflowId(),
                        LocalDate.of(2025, 3, 15),
                        "date-msg",
                        null,
                        SerializationStrategy.PORTABLE);
                    ctx.json(Map.of("childId", handle.workflowId()));
                  });

              config.routes.get(
                  "/workflow/{id}",
                  ctx -> {
                    var id = ctx.pathParam("id");
                    var found = dbos.getWorkflowStatus(id);
                    if (found.isEmpty()) {
                      ctx.status(404).result("no such workflow: " + id);
                      return;
                    }
                    var status = found.get();
                    // A LinkedHashMap rather than Map.of: these payloads carry
                    // nulls, and are compared field for field against the Python
                    // and TypeScript apps' answers for the same workflow.
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("workflowId", status.workflowId());
                    body.put("name", status.workflowName());
                    body.put("status", status.status().toString());
                    body.put("queueName", status.queueName());
                    body.put("applicationName", status.applicationName());
                    body.put("applicationVersion", status.appVersion());
                    body.put("parentWorkflowId", status.parentWorkflowId());
                    // The process that ran the workflow — different from the
                    // caller's when another application dequeued it.
                    body.put("executorId", status.executorId());
                    ctx.json(body);
                  });

              // Workflows visible to this application.
              //
              // With no `application_name` this lists only workflows *this*
              // application owns: listings on a shared system database are
              // scoped to the caller by default.
              config.routes.get(
                  "/workflows",
                  ctx -> {
                    var applicationName = ctx.queryParam("application_name");
                    var input = new ListWorkflowsInput().withLoadInput(false).withLoadOutput(false);
                    if (applicationName != null) {
                      input = input.withApplicationName(applicationName);
                    }
                    ctx.json(
                        dbos.listWorkflows(input).stream()
                            .map(
                                status -> {
                                  Map<String, Object> row = new LinkedHashMap<>();
                                  row.put("workflowId", status.workflowId());
                                  row.put("name", status.workflowName());
                                  row.put("applicationName", status.applicationName());
                                  return row;
                                })
                            .toList());
                  });

              config.routes.get(
                  "/steps/{id}",
                  ctx ->
                      ctx.json(
                          dbos.listWorkflowSteps(ctx.pathParam("id")).stream()
                              .map(
                                  step -> {
                                    Map<String, Object> row = new LinkedHashMap<>();
                                    row.put("functionId", step.functionId());
                                    row.put("functionName", step.functionName());
                                    row.put("childWorkflowId", step.childWorkflowId());
                                    return row;
                                  })
                              .toList()));
            });

    var serverPort = Objects.requireNonNullElse(System.getenv("SERVER_PORT"), "8004");
    app.start(Integer.parseInt(serverPort));
  }
}
