package org.example

// Note, we need to import the Kotlin startWorkflow and runStep extensions manually
import dev.dbos.transact.DBOS
import dev.dbos.transact.StartWorkflowOptions
import dev.dbos.transact.config.DBOSConfig
import dev.dbos.transact.runStep
import dev.dbos.transact.startWorkflow
import dev.dbos.transact.workflow.ListWorkflowsInput
import dev.dbos.transact.workflow.QueueConflictResolution
import dev.dbos.transact.workflow.QueueOptions
import dev.dbos.transact.workflow.Workflow
import dev.dbos.transact.workflow.WorkflowSchedule
import dev.dbos.transact.workflow.WorkflowStatus
import io.javalin.Javalin
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.slf4j.Logger
import org.slf4j.LoggerFactory

private val logger: Logger = LoggerFactory.getLogger("DurableStarterApp")

const val STEPS_EVENT = "steps_event"
const val COMM_STATUS_EVENT = "comm_status"
const val APPROVAL_TOPIC = "approval"

const val SCHEDULE_NAME = "scheduled-workflow"
const val DEFAULT_CRON = "*/5 * * * * *"
const val QUEUE_NAME = "demo-queue"
const val DEFAULT_WORKER_CONCURRENCY = 3

interface DurableStarterService {
  fun exampleWorkflow()

  fun scheduledWorkflow(scheduledTime: Instant, context: Any?)

  fun enqueuedWorkflow()

  fun communicationWorkflow()
}

class DurableStarterServiceImpl(private val dbos: DBOS) : DurableStarterService {

  private val logger: Logger = LoggerFactory.getLogger(DurableStarterServiceImpl::class.java)

  // ---- Workflows tab: a durable workflow with three steps ----

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

  // ---- Schedules tab: a workflow that runs on a cron schedule ----

  @Workflow
  override fun scheduledWorkflow(scheduledTime: Instant, context: Any?) {
    logger.info("Scheduled workflow starting.")
    dbos.sleep(Duration.ofSeconds(1))
    logger.info("Scheduled workflow ending.")
  }

  // ---- Queues tab: a queue-based workflow with adjustable worker concurrency ----

  @Workflow
  override fun enqueuedWorkflow() {
    logger.info("Enqueued workflow starting.")
    dbos.sleep(Duration.ofSeconds(5))
    logger.info("Enqueued workflow ending.")
  }

  // ---- Communication tab: a human-in-the-loop workflow ----

  private fun commStepOne() {
    Thread.sleep(2000)
    logger.info("Communication workflow: step 1 complete.")
  }

  private fun commStepTwo() {
    Thread.sleep(2000)
    logger.info("Communication workflow: step 2 complete.")
  }

  @Workflow
  override fun communicationWorkflow() {
    dbos.runStep("commStepOne") { commStepOne() }
    dbos.setEvent(COMM_STATUS_EVENT, "waiting")

    val decision = dbos.recv<String>(APPROVAL_TOPIC, Duration.ofSeconds(120)).orElse("")
    when (decision) {
      "approve" -> {
        dbos.setEvent(COMM_STATUS_EVENT, "step2")
        dbos.runStep("commStepTwo") { commStepTwo() }
        dbos.setEvent(COMM_STATUS_EVENT, "completed")
      }
      "deny" -> {
        dbos.setEvent(COMM_STATUS_EVENT, "denied")
        logger.info("Communication workflow: denied.")
      }
      else -> {
        dbos.setEvent(COMM_STATUS_EVENT, "timeout")
        logger.info("Communication workflow: timed out waiting for approval.")
      }
    }
  }
}

// Count workflows grouped by status (matches the frontend summary panels).
private fun countByStatus(wfs: List<WorkflowStatus>): Map<String, Int> =
  wfs.groupingBy { it.status().toString() }.eachCount()

// Workflows of the given name started in the last 10 minutes.
private fun recentByName(dbos: DBOS, name: String): List<WorkflowStatus> =
  dbos.listWorkflows(
    ListWorkflowsInput()
      .withWorkflowName(listOf(name))
      .withStartTime(Instant.now().minus(Duration.ofMinutes(10)))
      .withLimit(500)
      .withLoadInput(false)
      .withLoadOutput(false))

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
      config.events.serverStarting {
        dbos.launch()
        // Register the demo queue and apply the default schedule (after launch).
        dbos.registerQueue(
          QUEUE_NAME,
          QueueOptions.setWorkerConcurrency(DEFAULT_WORKER_CONCURRENCY),
          QueueConflictResolution.NEVER_UPDATE)
      }
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

      // ---- Schedule endpoints ----
      config.routes.get("/schedule/status") { ctx ->
        var cron = DEFAULT_CRON
        var status = "UNKNOWN"
        val sched = dbos.getSchedule(SCHEDULE_NAME)
        if (sched.isPresent) {
          cron = sched.get().cron()
          status = sched.get().status().toString()
        }
        ctx.json(
          mapOf(
            "cron" to cron,
            "schedule_status" to status,
            "workflow_counts" to countByStatus(recentByName(dbos, "scheduledWorkflow"))))
      }
      config.routes.post("/schedule/apply") { ctx ->
        var cron = DEFAULT_CRON
        try {
          val value = ctx.bodyAsClass(Map::class.java)["cron"]
          if (value != null && value.toString().isNotBlank()) cron = value.toString()
        } catch (_: Exception) {}
        dbos.applySchedules(
          WorkflowSchedule(
            SCHEDULE_NAME, "scheduledWorkflow", DurableStarterServiceImpl::class.java.name, cron))
        // Explicitly resume so Apply always leaves the schedule active.
        try {
          dbos.resumeSchedule(SCHEDULE_NAME)
        } catch (_: Exception) {}
        ctx.json(mapOf("ok" to true))
      }
      config.routes.post("/schedule/pause") { ctx ->
        dbos.pauseSchedule(SCHEDULE_NAME)
        ctx.json(mapOf("ok" to true))
      }
      config.routes.post("/schedule/resume") { ctx ->
        dbos.resumeSchedule(SCHEDULE_NAME)
        ctx.json(mapOf("ok" to true))
      }
      config.routes.post("/schedule/trigger") { ctx ->
        dbos.triggerSchedule<Any, Exception>(SCHEDULE_NAME)
        ctx.json(mapOf("ok" to true))
      }

      // ---- Queue endpoints ----
      config.routes.get("/queue/status") { ctx ->
        // findQueue reads the database-backed (dynamic) queue, so it reflects
        // runtime concurrency changes; getQueue only sees static queues.
        val workerConcurrency =
          dbos.findQueue(QUEUE_NAME).map { it.workerConcurrency() }.orElse(DEFAULT_WORKER_CONCURRENCY)
        ctx.json(
          mapOf(
            "worker_concurrency" to workerConcurrency,
            "workflow_counts" to countByStatus(recentByName(dbos, "enqueuedWorkflow"))))
      }
      config.routes.post("/queue/enqueue") { ctx ->
        dbos.startWorkflow(StartWorkflowOptions().withQueue(QUEUE_NAME)) { proxy.enqueuedWorkflow() }
        ctx.json(mapOf("ok" to true))
      }
      config.routes.post("/queue/concurrency") { ctx ->
        var concurrency = DEFAULT_WORKER_CONCURRENCY
        try {
          val value = ctx.bodyAsClass(Map::class.java)["concurrency"]
          if (value is Number && value.toInt() >= 1) concurrency = value.toInt()
        } catch (_: Exception) {}
        dbos.registerQueue(
          QUEUE_NAME,
          QueueOptions.setWorkerConcurrency(concurrency),
          QueueConflictResolution.ALWAYS_UPDATE)
        ctx.json(mapOf("ok" to true))
      }

      // ---- Communication endpoints ----
      config.routes.get("/comm/status/{workflowId}") { ctx ->
        val wfId = ctx.pathParam("workflowId")
        val state = dbos.getEvent<String>(wfId, COMM_STATUS_EVENT, Duration.ofSeconds(0)).orElse("step1")
        ctx.json(mapOf("state" to state))
      }
      config.routes.post("/comm/start") { ctx ->
        val wfId = UUID.randomUUID().toString().replace("-", "").substring(0, 12)
        dbos.startWorkflow(StartWorkflowOptions(wfId)) { proxy.communicationWorkflow() }
        ctx.json(mapOf("workflow_id" to wfId))
      }
      config.routes.post("/comm/approve/{workflowId}") { ctx ->
        dbos.send(ctx.pathParam("workflowId"), "approve", APPROVAL_TOPIC)
        ctx.json(mapOf("ok" to true))
      }
      config.routes.post("/comm/deny/{workflowId}") { ctx ->
        dbos.send(ctx.pathParam("workflowId"), "deny", APPROVAL_TOPIC)
        ctx.json(mapOf("ok" to true))
      }
    }
    .start(7070)
}
