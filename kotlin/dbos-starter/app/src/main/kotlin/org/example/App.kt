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
import dev.dbos.transact.workflow.WorkflowState
import dev.dbos.transact.workflow.WorkflowStatus
import io.javalin.Javalin
import io.javalin.http.Context
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ThreadLocalRandom
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

const val RATE_LIMITED_QUEUE_NAME = "rate-limited-queue"
const val DEFAULT_RATE_LIMIT = 2
val DEFAULT_RATE_PERIOD: Duration = Duration.ofSeconds(10)

const val FAIR_QUEUE_NAME = "fair-queue"
const val DEFAULT_PARTITION_CONCURRENCY = 1
const val DEFAULT_FAIR_WORKER_CONCURRENCY = 4
// The tenants the frontend offers. The random mix draws from the first four,
// leaving "ed" free to show a newcomer isn't stuck behind their backlog.
val FAIR_QUEUE_TENANTS = listOf("alice", "bob", "clark", "dave", "ed")

const val DELAYED_QUEUE_NAME = "delayed-queue"
// The longest delay the demo accepts: one day. DBOS itself has no hard limit.
const val MAX_DELAY_SECONDS = 24 * 60 * 60
const val DELAY_ERROR = "The delay must be a whole number of seconds from 1 to $MAX_DELAY_SECONDS"

interface DurableStarterService {
  fun exampleWorkflow()

  fun scheduledWorkflow(scheduledTime: Instant, context: Any?)

  fun queueWorkflow()

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

  // ---- Queues tab: every sub-page enqueues this same workflow, each on its own queue,
  // so the differences you see come from the queues alone ----

  @Workflow
  override fun queueWorkflow() {
    dbos.sleep(Duration.ofSeconds(5))
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

    val decision = dbos.recv<String>(APPROVAL_TOPIC, Duration.ofSeconds(15)).orElse("")
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
        // recv returns nothing on timeout. Throwing ends the workflow in the ERROR state.
        throw RuntimeException("Timed out waiting for approval")
      }
    }
  }
}

// Count workflows grouped by status (matches the frontend summary panels).
private fun countByStatus(wfs: List<WorkflowStatus>): Map<String, Int> =
  wfs.groupingBy { it.status().toString() }.eachCount()

// Count workflows per tenant. Each workflow's partition key is its tenant.
private fun countByTenant(wfs: List<WorkflowStatus>): List<Map<String, Any>> =
  wfs.groupingBy { it.queuePartitionKey() ?: "unknown" }
    .eachCount()
    .map { (tenant, count) -> mapOf("tenant_id" to tenant, "count" to count) }

private fun tenMinutesAgo(): Instant = Instant.now().minus(Duration.ofMinutes(10))

// Workflows of the given name started in the last 10 minutes.
private fun recentByName(dbos: DBOS, name: String): List<WorkflowStatus> =
  dbos.listWorkflows(
    ListWorkflowsInput()
      .withWorkflowName(listOf(name))
      .withStartTime(tenMinutesAgo())
      .withLimit(500)
      .withLoadInput(false)
      .withLoadOutput(false))

// Workflows on the given queue started in the last 10 minutes, newest first.
private fun recentOnQueue(dbos: DBOS, queueName: String): List<WorkflowStatus> =
  dbos.listWorkflows(
    ListWorkflowsInput()
      .withQueueName(queueName)
      .withStartTime(tenMinutesAgo())
      .withSortDesc(true)
      .withLimit(500)
      .withLoadInput(false)
      .withLoadOutput(false))

// Workflows on the given queue in any of the given states, newest first.
private fun onQueue(dbos: DBOS, queueName: String, vararg states: WorkflowState): List<WorkflowStatus> =
  dbos.listWorkflows(
    ListWorkflowsInput()
      .withQueueName(queueName)
      .withStatus(*states)
      .withSortDesc(true)
      .withLoadInput(false)
      .withLoadOutput(false))

// The request's JSON body, or an empty map if it has none.
private fun body(ctx: Context): Map<*, *> =
  try {
    ctx.bodyAsClass(Map::class.java)
  } catch (_: Exception) {
    emptyMap<Any, Any>()
  }

// Parse a request field (a JSON number or string) as an integer >= 1, or return null.
private fun parsePositiveInt(value: Any?): Int? {
  val n =
    when (value) {
      is Number -> value.toDouble()
      is String -> value.trim().toDoubleOrNull()
      else -> null
    } ?: return null
  return if (n >= 1 && n <= Int.MAX_VALUE && n == Math.floor(n)) n.toInt() else null
}

// Parse a request field as a trimmed name of 1 to 40 characters, or return null.
private fun parseName(value: Any?): String? =
  value?.toString()?.trim()?.takeIf { it.isNotEmpty() && it.length <= 40 }

// Parse a request field as a whole number of seconds from 1 to MAX_DELAY_SECONDS, or return null.
private fun parseDelaySeconds(value: Any?): Int? =
  parsePositiveInt(value)?.takeIf { it <= MAX_DELAY_SECONDS }

private fun respondError(ctx: Context, status: Int, message: String) {
  ctx.status(status).json(mapOf("error" to message))
}

// Enqueue one workflow in the tenant's partition of the fair queue.
private fun enqueueForTenant(dbos: DBOS, proxy: DurableStarterService, tenantId: String) {
  dbos.startWorkflow(
    StartWorkflowOptions().withQueue(FAIR_QUEUE_NAME).withQueuePartitionKey(tenantId)) {
      proxy.queueWorkflow()
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
      .withConductorKey(System.getenv("DBOS_CONDUCTOR_KEY"))

  val dbos = DBOS(dbosConfig)

  val proxy = dbos.registerProxy(DurableStarterService::class.java, DurableStarterServiceImpl(dbos))

  Javalin.create { config ->
      config.startup.showJavalinBanner = false
      config.events.serverStarting {
        dbos.launch()
        // Register the demo queues (after launch). NEVER_UPDATE keeps any settings
        // changed at runtime across restarts.
        dbos.registerQueue(
          QUEUE_NAME,
          QueueOptions.setWorkerConcurrency(DEFAULT_WORKER_CONCURRENCY),
          QueueConflictResolution.NEVER_UPDATE)
        dbos.registerQueue(
          RATE_LIMITED_QUEUE_NAME,
          QueueOptions.setRateLimit(DEFAULT_RATE_LIMIT, DEFAULT_RATE_PERIOD),
          QueueConflictResolution.NEVER_UPDATE)
        dbos.registerQueue(
          FAIR_QUEUE_NAME,
          QueueOptions.setPartitionConcurrency(DEFAULT_PARTITION_CONCURRENCY)
            .andWorkerConcurrency(DEFAULT_FAIR_WORKER_CONCURRENCY),
          QueueConflictResolution.NEVER_UPDATE)
        dbos.registerQueue(DELAYED_QUEUE_NAME, QueueOptions.empty(), QueueConflictResolution.NEVER_UPDATE)
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

      // ---- Queues tab, worker concurrency: a queue with adjustable worker concurrency ----
      config.routes.get("/queue/status") { ctx ->
        // findQueue reads the database-backed (dynamic) queue, so it reflects
        // runtime concurrency changes; getQueue only sees static queues.
        val workerConcurrency =
          dbos.findQueue(QUEUE_NAME).map { it.workerConcurrency() }.orElse(DEFAULT_WORKER_CONCURRENCY)
        ctx.json(
          mapOf(
            "worker_concurrency" to workerConcurrency,
            "workflow_counts" to countByStatus(recentOnQueue(dbos, QUEUE_NAME))))
      }
      config.routes.post("/queue/enqueue") { ctx ->
        dbos.startWorkflow(StartWorkflowOptions().withQueue(QUEUE_NAME)) { proxy.queueWorkflow() }
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

      // ---- Queues tab, rate limiting: a queue that starts at most `limit` workflows
      // every `period`. The rate limit can be changed at runtime. ----
      config.routes.get("/queue/rate/status") { ctx ->
        val rateLimit = dbos.findQueue(RATE_LIMITED_QUEUE_NAME).map { it.rateLimit() }.orElse(null)
        val wfs = recentOnQueue(dbos, RATE_LIMITED_QUEUE_NAME)
        ctx.json(
          mapOf(
            "limit_per_period" to (rateLimit?.limit() ?: DEFAULT_RATE_LIMIT),
            "period_sec" to (rateLimit?.period() ?: DEFAULT_RATE_PERIOD).toSeconds(),
            "workflow_counts" to countByStatus(wfs),
            // The newest workflows. started_at is when the queue let each one start,
            // so the gaps between start times show the rate limit at work.
            "workflows" to
              wfs.take(50).map {
                mapOf(
                  "workflow_id" to it.workflowId(),
                  "status" to it.status().toString(),
                  "enqueued_at" to it.createdAtEpochMs(),
                  "started_at" to it.startedAtEpochMs())
              }))
      }
      config.routes.post("/queue/rate/enqueue") { ctx ->
        dbos.startWorkflow(StartWorkflowOptions().withQueue(RATE_LIMITED_QUEUE_NAME)) {
          proxy.queueWorkflow()
        }
        ctx.json(mapOf("ok" to true))
      }
      config.routes.post("/queue/rate/limit") { ctx ->
        val body = body(ctx)
        val limit = parsePositiveInt(body["limit_per_period"])
        val periodSec = parsePositiveInt(body["period_sec"])
        if (limit == null || periodSec == null) {
          respondError(ctx, 400, "The limit and period must be whole numbers of at least 1")
          return@post
        }
        dbos.updateQueue(
          RATE_LIMITED_QUEUE_NAME, QueueOptions.setRateLimit(limit, Duration.ofSeconds(periodSec.toLong())))
        ctx.json(mapOf("ok" to true))
      }

      // ---- Queues tab, fair queues: a queue partitioned by tenant.
      // partitionConcurrency limits how many workflows each tenant runs at once,
      // and workerConcurrency limits how many run on this process in total,
      // so one busy tenant can't starve the others.
      // Both limits can be changed at runtime. ----
      config.routes.get("/queue/fair/status") { ctx ->
        val queue = dbos.findQueue(FAIR_QUEUE_NAME)
        val success =
          dbos.listWorkflows(
            ListWorkflowsInput()
              .withQueueName(FAIR_QUEUE_NAME)
              .withStatus(WorkflowState.SUCCESS)
              .withStartTime(tenMinutesAgo())
              .withLoadInput(false)
              .withLoadOutput(false))
        ctx.json(
          mapOf(
            "partition_concurrency" to
              queue.map { it.partitionConcurrency() }.orElse(DEFAULT_PARTITION_CONCURRENCY),
            "worker_concurrency" to
              queue.map { it.workerConcurrency() }.orElse(DEFAULT_FAIR_WORKER_CONCURRENCY),
            "enqueued" to countByTenant(onQueue(dbos, FAIR_QUEUE_NAME, WorkflowState.ENQUEUED)),
            "pending" to
              onQueue(dbos, FAIR_QUEUE_NAME, WorkflowState.PENDING).map {
                mapOf("workflow_id" to it.workflowId(), "tenant_id" to (it.queuePartitionKey() ?: "unknown"))
              },
            "success" to countByTenant(success)))
      }
      config.routes.post("/queue/fair/enqueue") { ctx ->
        val tenantId = parseName(body(ctx)["tenant_id"])
        if (tenantId == null) {
          respondError(ctx, 400, "Tenant names must be 1 to 40 characters")
          return@post
        }
        enqueueForTenant(dbos, proxy, tenantId)
        ctx.json(mapOf("ok" to true))
      }
      // Enqueue a batch of workflows across four tenants, skewed toward one of them.
      config.routes.post("/queue/fair/random_mix") { ctx ->
        val total = 50
        val random = ThreadLocalRandom.current()
        val tenants = FAIR_QUEUE_TENANTS.take(4)
        val favored = tenants[random.nextInt(tenants.size)]
        // The favored tenant is twice as likely to be picked. Picks are made one
        // at a time, so the workflows arrive in randomized order.
        val weighted = tenants + favored
        repeat(total) {
          enqueueForTenant(dbos, proxy, weighted[random.nextInt(weighted.size)])
          Thread.sleep(10)
        }
        ctx.json(mapOf("total" to total, "favored" to favored))
      }
      config.routes.post("/queue/fair/limits") { ctx ->
        val body = body(ctx)
        val partitionConcurrency = parsePositiveInt(body["partition_concurrency"])
        val workerConcurrency = parsePositiveInt(body["worker_concurrency"])
        if (partitionConcurrency == null || workerConcurrency == null) {
          respondError(
            ctx, 400, "partitionConcurrency and workerConcurrency must be whole numbers of at least 1")
          return@post
        }
        dbos.updateQueue(
          FAIR_QUEUE_NAME,
          QueueOptions.setPartitionConcurrency(partitionConcurrency)
            .andWorkerConcurrency(workerConcurrency))
        ctx.json(mapOf("ok" to true))
      }

      // ---- Queues tab, delays: enqueue a workflow that waits before running.
      // The workflow stays DELAYED until its delay expires, then becomes ENQUEUED and
      // runs. While it's DELAYED, its delay can be changed to run it sooner or later.
      // The delay is stored in the database, so it survives restarts. ----
      config.routes.get("/queue/delay/status") { ctx ->
        // List every workflow still in progress, plus any created in the last 10 minutes.
        val active =
          onQueue(
            dbos,
            DELAYED_QUEUE_NAME,
            WorkflowState.DELAYED,
            WorkflowState.ENQUEUED,
            WorkflowState.PENDING)
        val byId = (recentOnQueue(dbos, DELAYED_QUEUE_NAME) + active).associateBy { it.workflowId() }
        ctx.json(
          mapOf(
            "workflows" to
              byId.values
                .sortedByDescending { it.createdAtEpochMs() ?: 0L }
                .take(50)
                .map {
                  mapOf(
                    "workflow_id" to it.workflowId(),
                    "status" to it.status().toString(),
                    "enqueued_at" to it.createdAtEpochMs(),
                    // When the delay expires and the workflow becomes eligible to run.
                    "due_at" to it.delayUntilEpochMs())
                }))
      }
      config.routes.post("/queue/delay/enqueue") { ctx ->
        val delaySeconds = parseDelaySeconds(body(ctx)["delay_seconds"])
        if (delaySeconds == null) {
          respondError(ctx, 400, DELAY_ERROR)
          return@post
        }
        dbos.startWorkflow(
          StartWorkflowOptions()
            .withQueue(DELAYED_QUEUE_NAME)
            .withDelay(Duration.ofSeconds(delaySeconds.toLong()))) {
            proxy.queueWorkflow()
          }
        ctx.json(mapOf("ok" to true))
      }
      // Change a workflow's delay, counting from now. DBOS only changes the delay
      // of a workflow that is still DELAYED.
      config.routes.post("/queue/delay/set/{workflowId}") { ctx ->
        val workflowId = ctx.pathParam("workflowId")
        val delaySeconds = parseDelaySeconds(body(ctx)["delay_seconds"])
        if (delaySeconds == null) {
          respondError(ctx, 400, DELAY_ERROR)
          return@post
        }
        val status = dbos.getWorkflowStatus(workflowId).orElse(null)
        if (status == null || status.queueName() != DELAYED_QUEUE_NAME) {
          respondError(ctx, 404, "Delayed workflow not found")
          return@post
        }
        if (status.status() != WorkflowState.DELAYED) {
          respondError(ctx, 409, "The workflow is ${status.status()}, so its delay can no longer change")
          return@post
        }
        dbos.setWorkflowDelay(workflowId, Duration.ofSeconds(delaySeconds.toLong()))
        ctx.json(mapOf("ok" to true))
      }

      // ---- Communication endpoints ----
      config.routes.get("/comm/status/{workflowId}") { ctx ->
        val wfId = ctx.pathParam("workflowId")
        // The workflow throws when it times out waiting for approval, so it ends in ERROR.
        val wf = dbos.getWorkflowStatus(wfId).orElse(null)
        if (wf != null && wf.status() == WorkflowState.ERROR) {
          ctx.json(mapOf("state" to "timeout", "error" to (wf.error()?.message() ?: "")))
          return@get
        }
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
