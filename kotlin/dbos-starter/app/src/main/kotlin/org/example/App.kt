package org.example

// Note, we need to import the Kotlin startWorkflow and runStep extensions manually
import dev.dbos.transact.DBOS
import dev.dbos.transact.StartWorkflowOptions
import dev.dbos.transact.config.DBOSConfig
import dev.dbos.transact.runStep
import dev.dbos.transact.startWorkflow
import dev.dbos.transact.workflow.Workflow
import io.javalin.Javalin
import java.time.Duration
import org.slf4j.Logger
import org.slf4j.LoggerFactory

private val logger: Logger = LoggerFactory.getLogger("DurableStarterApp")

const val STEPS_EVENT = "steps_event"

interface DurableStarterService {
  fun exampleWorkflow()
}

class DurableStarterServiceImpl(private val dbos: DBOS) : DurableStarterService {

  private val logger: Logger = LoggerFactory.getLogger(DurableStarterServiceImpl::class.java)

  private fun stepOne() {
    Thread.sleep(5000)
    logger.info("Workflow {} step 1 completed!", DBOS.workflowId())
  }

  private fun stepTwo() {
    Thread.sleep(5000)
    logger.info("Workflow {} step 2 completed!", DBOS.workflowId())
  }

  private fun stepThree() {
    Thread.sleep(5000)
    logger.info("Workflow {} step 3 completed!", DBOS.workflowId())
  }

  @Workflow
  override fun exampleWorkflow() {
    dbos.runStep("stepOne") { stepOne() }
    dbos.setEvent(STEPS_EVENT, 1)
    dbos.runStep("stepTwo") { stepTwo() }
    dbos.setEvent(STEPS_EVENT, 2)
    dbos.runStep("stepThree") { stepThree() }
    dbos.setEvent(STEPS_EVENT, 3)
  }
}

fun main(args: Array<String>) {
  val dbUrl =
    System.getenv("DBOS_SYSTEM_JDBC_URL")?.takeIf { it.isNotEmpty() }
      ?: "jdbc:postgresql://localhost:5432/dbos_starter_kotlin"
  val dbUser = System.getenv("PGUSER") ?: "postgres"
  val dbPassword = System.getenv("PGPASSWORD") ?: "dbos"

  val dbosConfig =
    DBOSConfig.defaults("dbos-starter-kotlin")
      .withDatabaseUrl(dbUrl)
      .withDbUser(dbUser)
      .withDbPassword(dbPassword)
      .withAppVersion("0.2.0")

  val dbos = DBOS(dbosConfig)

  val proxy = dbos.registerProxy(DurableStarterService::class.java, DurableStarterServiceImpl(dbos))

  Javalin.create { config ->
      config.startup.showJavalinBanner = false
      config.events.serverStarting { dbos.launch() }
      config.events.serverStopping { dbos.shutdown() }
      config.routes.get("/") { ctx ->
        ctx.contentType("text/html")
        ctx.result(object {}.javaClass.getResourceAsStream("/index.html"))
      }
      config.routes.get("/workflow/{taskId}") { ctx ->
        val taskId = ctx.pathParam("taskId")
        dbos.startWorkflow(StartWorkflowOptions(taskId)) { proxy.exampleWorkflow() }
        ctx.status(200)
      }
      config.routes.get("/last_step/{taskId}") { ctx ->
        val taskId = ctx.pathParam("taskId")
        val step = dbos.getEvent<Int>(taskId, STEPS_EVENT, Duration.ofSeconds(0)).orElse(0)
        ctx.result(step.toString())
      }
      config.routes.post("/crash") { ctx ->
        logger.warn("Crash endpoint called - terminating application")
        Runtime.getRuntime().halt(0)
        ctx.status(200)
      }
    }
    .start(7070)
}
