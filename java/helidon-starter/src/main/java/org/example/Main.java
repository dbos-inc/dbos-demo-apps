package org.example;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.StartWorkflowOptions;
import dev.dbos.transact.config.DBOSConfig;

import io.helidon.config.Config;
import io.helidon.http.HttpMediaType;
import io.helidon.http.Status;
import io.helidon.logging.common.LogConfig;
import io.helidon.service.registry.Services;
import io.helidon.webserver.WebServer;

import java.io.InputStream;
import java.time.Duration;
import java.util.Objects;
import java.util.logging.Logger;

public class Main {

    private static final Logger logger = Logger.getLogger(Main.class.getSimpleName());

    private Main() {
    }

    public static void main(String[] args) {
        LogConfig.configureRuntime();

        var dbUrl = System.getenv("DBOS_SYSTEM_JDBC_URL");
        if (dbUrl == null || dbUrl.isEmpty()) {
            dbUrl = "jdbc:postgresql://localhost:5432/dbos_starter_java";
        }
        var dbUser = Objects.requireNonNullElse(System.getenv("PGUSER"), "postgres");
        var dbPassword = Objects.requireNonNullElse(System.getenv("PGPASSWORD"), "dbos");

        var dbosConfig = DBOSConfig.defaults("dbos-starter-java")
                .withDatabaseUrl(dbUrl)
                .withDbUser(dbUser)
                .withDbPassword(dbPassword)
                .withAppVersion("0.2.0");

        var dbos = new DBOS(dbosConfig);
        var proxy = dbos.registerWorkflows(DurableStarterService.class, new DurableStarterServiceImpl(dbos));

        dbos.launch();

        Config config = Config.create();
        Services.set(Config.class, config);

        WebServer server = WebServer.builder()
                .config(config.get("server"))
                .routing(routing -> routing
                        .get("/", (req, res) -> {
                            try (InputStream html = Main.class.getResourceAsStream("/index.html")) {
                                res.headers().contentType(HttpMediaType.create("text/html; charset=utf-8"));
                                res.send(html.readAllBytes());
                            }
                        })
                        .get("/workflow/{taskId}", (req, res) -> {
                            var taskId = req.path().pathParameters().get("taskId");
                            dbos.startWorkflow(() -> proxy.exampleWorkflow(), new StartWorkflowOptions(taskId));
                            res.status(Status.OK_200).send();
                        })
                        .get("/last_step/{taskId}", (req, res) -> {
                            var taskId = req.path().pathParameters().get("taskId");
                            var step = (Integer) dbos.getEvent(
                                    taskId,
                                    DurableStarterServiceImpl.STEPS_EVENT,
                                    Duration.ofSeconds(0));
                            res.send(String.valueOf(step != null ? step : 0));
                        })
                        .post("/crash", (req, res) -> {
                            logger.warning("Crash endpoint called - terminating application");
                            Runtime.getRuntime().halt(0);
                            res.status(Status.OK_200).send();
                        }))
                .build()
                .start();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            server.stop();
            dbos.shutdown();
        }));

        logger.info("WEB server is up! http://localhost:%d/".formatted(server.port()));
    }
}
