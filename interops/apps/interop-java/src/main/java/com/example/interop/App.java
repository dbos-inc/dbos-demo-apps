package com.example.interop;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.DBOSClient;
import dev.dbos.transact.config.DBOSConfig;
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

public class App {

  private static final Map<String, String> QUEUE_NAMES =
      Map.of(
          "python", "interop-queue-python",
          "typescript", "interop-queue-typescript",
          "go", "interop-queue-go",
          "java", "interop-queue-java");

  public static void main(String[] args) {
    String jdbcUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
    if (jdbcUrl == null || jdbcUrl.isBlank()) {
      jdbcUrl = "jdbc:postgresql://localhost:5432/interop_dbos_sys";
    }

    var dbosConfig =
        DBOSConfig.defaults("interop-java")
            .withDatabaseUrl(jdbcUrl)
            .withDbUser(Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres"))
            .withDbPassword(Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos"))
            .withAppVersion("interop-v1");

    var dbos = new DBOS(dbosConfig);

    var impl = new InteropServiceImpl(dbos);
    dbos.registerProxy(InteropService.class, impl, "default");
    dbos.registerQueue(new Queue("interop-queue-java"));

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
                    var queueName = QUEUE_NAMES.get(target);
                    if (queueName == null) {
                      ctx.status(400).result("unknown target: " + target);
                      return;
                    }

                    String sysJdbcUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
                    if (sysJdbcUrl == null || sysJdbcUrl.isBlank()) {
                      ctx.status(500).result("DBOS_SYSTEM_JDBC_URL not set");
                      return;
                    }
                    String user = Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres");
                    String password =
                        Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos");

                    @SuppressWarnings("unchecked")
                    Map<String, Object> payload = ctx.bodyAsClass(Map.class);
                    @SuppressWarnings("unchecked")
                    List<Object> positionalArgs =
                        (List<Object>) payload.getOrDefault("positionalArgs", List.of());
                    @SuppressWarnings("unchecked")
                    Map<String, Object> namedArgs =
                        (Map<String, Object>) payload.getOrDefault("namedArgs", Map.of());

                    var client = new DBOSClient(sysJdbcUrl, user, password);
                    try {
                      var options =
                          new DBOSClient.EnqueueOptions("echoWorkflow", "interop", queueName)
                              .withInstanceName("default")
                              .withSerialization(SerializationStrategy.PORTABLE)
                              .withTimeout(Duration.ofSeconds(30))
                              .withAppVersion("interop-v1");

                      var handle =
                          client.enqueuePortableWorkflow(
                              options,
                              positionalArgs.toArray(),
                              namedArgs.isEmpty() ? null : namedArgs);

                      client.send(
                          handle.workflowId(),
                          LocalDate.of(2025, 3, 15),
                          "date-msg",
                          null,
                          DBOSClient.SendOptions.portable());

                      @SuppressWarnings("unchecked")
                      Map<String, Object> result = (Map<String, Object>) handle.getResult();
                      ctx.json(result);
                    } finally {
                      client.close();
                    }
                  });
            });

    var serverPort = Objects.requireNonNullElse(System.getenv("SERVER_PORT"), "8004");
    app.start(Integer.parseInt(serverPort));
  }
}
