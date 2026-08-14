package org.example

// Note, we need to import the Kotlin startWorkflow extension manually
import dev.dbos.transact.DBOS
import dev.dbos.transact.StartWorkflowOptions
import dev.dbos.transact.config.DBOSConfig
import dev.dbos.transact.execution.ThrowingRunnable
import dev.dbos.transact.startWorkflow
import dev.dbos.transact.workflow.ListWorkflowsInput
import dev.dbos.transact.workflow.QueueOptions
import dev.dbos.transact.workflow.Workflow
import dev.dbos.transact.workflow.WorkflowState
import dev.dbos.transact.workflow.WorkflowStatus
import dev.dbos.transact.workflow.internal.DebouncerMessage
import io.javalin.Javalin
import io.javalin.http.staticfiles.Location
import java.time.Duration
import java.time.Instant
import kotlin.random.Random
import org.slf4j.Logger
import org.slf4j.LoggerFactory

private val logger: Logger = LoggerFactory.getLogger("QueuePatternsApp")

const val CONCURRENCY_QUEUE = "concurrency-queue"
const val PARTITIONED_QUEUE = "partitioned-queue"
const val RATE_LIMITED_QUEUE = "rate-limited-queue"
const val DEBOUNCER_QUEUE = "debouncer-queue"

// The set of tenants the UI offers and the randomized batch draws from.
val FAIR_QUEUE_TENANTS = listOf("alice", "bob", "clark", "dave", "ed")

interface QueuePatternsService {
  fun fairQueueWorkflow()

  fun fairQueueConcurrencyManager()

  fun rateLimitedQueueWorkflow()

  fun debouncerWorkflow(tenantId: String, input: String)
}

class QueuePatternsServiceImpl(private val dbos: DBOS) : QueuePatternsService {

  private val logger: Logger = LoggerFactory.getLogger(QueuePatternsServiceImpl::class.java)

  // The proxy is what routes calls through DBOS, so the manager workflow uses it to
  // enqueue its child rather than calling the method directly.
  lateinit var proxy: QueuePatternsService

  // ---- Fair Queueing ----

  // The workflow for fair queueing simply sleeps for 5 seconds.
  @Workflow(name = "fair_queue_workflow")
  override fun fairQueueWorkflow() {
    dbos.sleep(Duration.ofSeconds(5))
  }

  // The fair queue example uses two queues:
  // PARTITIONED_QUEUE is split by tenant ID and limits the total number of concurrent tasks
  // per tenant.
  // CONCURRENCY_QUEUE limits the number of concurrent tasks per worker.
  // These are registered in main().
  // Workflows are first enqueued on the former and then to the latter, thus applying the
  // limits of both queues.
  @Workflow(name = "fair_queue_concurrency_manager")
  override fun fairQueueConcurrencyManager() {
    // This "concurrency manager" workflow holds a slot on PARTITIONED_QUEUE and executes
    // fairQueueWorkflow on the CONCURRENCY_QUEUE.
    val handle =
      dbos.startWorkflow(StartWorkflowOptions().withQueue(CONCURRENCY_QUEUE)) {
        proxy.fairQueueWorkflow()
      }
    handle.result
  }

  // ---- Rate Limiting ----

  // This workflow is rate-limited: No more than two workflows can start per 10 seconds.
  // See RATE_LIMITED_QUEUE in main().
  @Workflow(name = "rate_limited_queue_workflow")
  override fun rateLimitedQueueWorkflow() {
    dbos.sleep(Duration.ofSeconds(5))
  }

  // ---- Debouncing ----

  @Workflow(name = "debouncer_workflow")
  override fun debouncerWorkflow(tenantId: String, input: String) {
    logger.info("Executing debounced workflow for tenant {} with input {}", tenantId, input)
    dbos.sleep(Duration.ofSeconds(5))
  }
}

// ---- Observability helpers ----

private fun thirtyMinutesAgo(): Instant = Instant.now().minus(Duration.ofMinutes(30))

// Enqueue a single "concurrency manager" workflow to PARTITIONED_QUEUE
private fun enqueueForTenant(dbos: DBOS, proxy: QueuePatternsService, tenantId: String) {
  dbos.startWorkflow(
    StartWorkflowOptions().withQueue(PARTITIONED_QUEUE).withQueuePartitionKey(tenantId)
  ) {
    proxy.fairQueueConcurrencyManager()
  }
}

private fun listByStatus(
  dbos: DBOS,
  name: String,
  states: List<WorkflowState>,
  loadInput: Boolean,
): List<WorkflowStatus> =
  dbos.listWorkflows(
    ListWorkflowsInput()
      .withWorkflowName(listOf(name))
      .withStatus(states)
      .withSortDesc(true)
      .withLoadInput(loadInput)
      .withLoadOutput(false)
  )

private fun countsByTenant(workflows: List<WorkflowStatus>): List<Map<String, Any>> {
  val counts = LinkedHashMap<String, Int>()
  for (w in workflows) {
    val tenant = w.queuePartitionKey() ?: "unknown"
    counts[tenant] = (counts[tenant] ?: 0) + 1
  }
  return counts.map { (tenant, count) -> mapOf("tenant_id" to tenant, "count" to count) }
}

// The debounced workflow's arguments are (tenantId, input).
private fun argAt(w: WorkflowStatus, index: Int): String? = w.input()?.getOrNull(index)?.toString()

// A row of the debouncer pipeline: the tenant and the input it is carrying.
private fun debounceItem(w: WorkflowStatus): Map<String, Any?> =
  mapOf(
    "workflow_id" to w.workflowId(),
    "tenant_id" to (argAt(w, 0) ?: "unknown"),
    "input" to (argAt(w, 1) ?: ""),
    "start_time" to w.createdAtEpochMs(),
    // For DELAYED workflows this is when the debounce window closes and the workflow
    // will run; null once it has left DELAYED.
    "delay_until" to w.delayUntilEpochMs(),
    // When the workflow actually started running (it left the debounce window), which
    // is what the completed list sorts by.
    "ran_at" to (w.startedAtEpochMs() ?: w.createdAtEpochMs()),
  )

private fun debounceItems(workflows: List<WorkflowStatus>): List<Map<String, Any?>> =
  workflows.map { debounceItem(it) }

// ---- The "waiting to debounce" list ----
//
// The Kotlin debouncer coalesces inside an internal "waiter" workflow: the first call
// enqueues it on the SDK's internal queue holding "<workflowName>-<key>" as its
// deduplication ID, and later calls send it the new input. The debounced workflow
// itself is not created until the window closes. We use the waiter workflow to monitor
// workflows due to start.
private const val INTERNAL_QUEUE = "_dbos_internal_queue"
private const val DEBOUNCE_WAITER_NAME = "debouncerWorkflow"
private const val DEBOUNCE_WAITER_CLASS = "DBOS.InternalWorkflows"
private const val DEBOUNCE_KEY_PREFIX = "debouncer_workflow-"

private fun messageArg(candidate: Any?, index: Int): String? =
  (candidate as? DebouncerMessage)?.args()?.getOrNull(index)?.toString()

private fun delayedDebounces(dbos: DBOS): List<Map<String, Any?>> {
  // Search for the special "debouncer" workflow
  val waiters =
    dbos.listWorkflows(
      ListWorkflowsInput()
        .withWorkflowName(listOf(DEBOUNCE_WAITER_NAME))
        .withClassName(DEBOUNCE_WAITER_CLASS)
        .withQueueName(listOf(INTERNAL_QUEUE))
        .withStatus(listOf(WorkflowState.PENDING))
        .withLoadInput(true)
        .withLoadOutput(false)
    )

  val now = System.currentTimeMillis()
  val rows = mutableListOf<Map<String, Any?>>()
  for (waiter in waiters) {
    val dedupId = waiter.deduplicationId() ?: continue
    if (!dedupId.startsWith(DEBOUNCE_KEY_PREFIX)) continue // not a debounce of our workflow
    val tenant = dedupId.removePrefix(DEBOUNCE_KEY_PREFIX)

    // The input the waiter started with, before any further calls replaced it.
    var input = waiter.input()?.firstNotNullOfOrNull { messageArg(it, 1) }

    //locate the last "sleep" step and use its deadline to determine when the debounce window closes
    var deadline: Long? = null
    for (step in dbos.listWorkflowSteps(waiter.workflowId())) {
      val output = step.output()
      if (step.functionName() == "DBOS.sleep" && output is Long) {
        deadline = output
      } else {
        messageArg(output, 1)?.let { input = it }
      }
    }

    // Window already closed; the workflow shows up as pending/completed instead.
    if (deadline == null || deadline <= now) continue

    rows.add(
      mapOf(
        "workflow_id" to waiter.workflowId(),
        "tenant_id" to tenant,
        "input" to (input ?: ""),
        "start_time" to waiter.createdAtEpochMs(),
        "delay_until" to deadline,
        "ran_at" to deadline,
      )
    )
  }
  return rows.sortedBy { it["tenant_id"] as String }
}

fun main() {
  val dbUrl =
    System.getenv("DBOS_SYSTEM_JDBC_URL").takeUnless { it.isNullOrEmpty() }
      ?: "jdbc:postgresql://localhost:5432/dbos_queue_patterns_kotlin"
  val dbUser = System.getenv("PGUSER") ?: "postgres"
  val dbPassword = System.getenv("PGPASSWORD") ?: "dbos"

  val dbosConfig =
    DBOSConfig.defaults("dbos-queue-patterns")
      .withDatabaseUrl(dbUrl)
      .withDbUser(dbUser)
      .withDbPassword(dbPassword)
      .withAppVersion("0.1.0")
      .withConductorKey(System.getenv("DBOS_CONDUCTOR_KEY"))

  val dbos = DBOS(dbosConfig)

  val impl = QueuePatternsServiceImpl(dbos)
  val proxy = dbos.registerProxy(QueuePatternsService::class.java, impl)
  impl.proxy = proxy

  Javalin.create { config ->
      config.startup.showJavalinBanner = false
      // Serve the built frontend
      config.staticFiles.add("frontend/dist", Location.EXTERNAL)

      config.events.serverStarting {
        dbos.launch()
        dbos.registerQueue(CONCURRENCY_QUEUE, QueueOptions.setWorkerConcurrency(4))
        dbos.registerQueue(
          PARTITIONED_QUEUE,
          QueueOptions.setPartitionQueue(true).andConcurrency(2),
        )
        dbos.registerQueue(RATE_LIMITED_QUEUE, QueueOptions.setRateLimit(2, Duration.ofSeconds(10)))
        dbos.registerQueue(DEBOUNCER_QUEUE, QueueOptions.empty())
      }
      config.events.serverStopping { dbos.shutdown() }

      // ---- Fair Queueing ----

      // Handler for single-workflow enqueue
      config.routes.post("/api/workflows/fair_queue") { ctx ->
        enqueueForTenant(dbos, proxy, ctx.queryParam("tenant_id") ?: "")
        ctx.status(200)
      }

      // Enqueue a randomized mix of workflows
      config.routes.post("/api/workflows/fair_queue/random_mix") { ctx ->
        val total = 50
        val tenants = FAIR_QUEUE_TENANTS.subList(0, 4)
        val favored = tenants[Random.nextInt(tenants.size)]
        // The favored tenant is twice as likely to be picked, so the batch is skewed toward
        // it. Picks are made one at a time, so they arrive in randomized order.
        val weighted = tenants.flatMap { if (it == favored) listOf(it, it) else listOf(it) }
        repeat(total) {
          enqueueForTenant(dbos, proxy, weighted[Random.nextInt(weighted.size)])
          Thread.sleep(10)
        }
        ctx.json(mapOf("total" to total, "favored" to favored))
      }

      // ---- Rate Limiting ----

      config.routes.post("/api/workflows/rate_limited_queue") { ctx ->
        dbos.startWorkflow(StartWorkflowOptions().withQueue(RATE_LIMITED_QUEUE)) {
          proxy.rateLimitedQueueWorkflow()
        }
        ctx.status(200)
      }

      // ---- Debouncing ----

      config.routes.post("/api/workflows/debouncer") { ctx ->
        val tenantId = ctx.queryParam("tenant_id") ?: ""
        val input = ctx.queryParam("input") ?: ""
        // Each time a new input is submitted for a tenant, debounce debouncerWorkflow. The
        // debouncer waits until 10 seconds after input stops being submitted for the tenant,
        // then enqueues the workflow with the last input submitted.
        val debounceKey = tenantId
        val debouncePeriod = Duration.ofSeconds(10)
        dbos
          .debouncer<Unit>()
          .withQueue(DEBOUNCER_QUEUE)
          .debounce(
            debounceKey,
            debouncePeriod,
            ThrowingRunnable { proxy.debouncerWorkflow(tenantId, input) },
          )
        ctx.status(200)
      }

      // ---- Observability ----

      config.routes.get("/api/workflows") { ctx ->
        val workflowName = ctx.queryParam("workflow_name") ?: ""
        val workflows =
          dbos.listWorkflows(
            ListWorkflowsInput()
              .withWorkflowName(listOf(workflowName))
              .withSortDesc(true)
              .withLoadInput(true)
              .withLoadOutput(false)
          )
        ctx.json(
          workflows.map { w ->
            val tenantId: String?
            val input: String?
            when {
              workflowName.contains("fair_queue") -> {
                tenantId = w.queuePartitionKey()
                input = null
              }
              workflowName.contains("debouncer") -> {
                tenantId = argAt(w, 0)
                input = argAt(w, 1)
              }
              else -> {
                tenantId = null
                input = null
              }
            }
            mapOf(
              "workflow_id" to w.workflowId(),
              "workflow_status" to w.status().name,
              "workflow_name" to w.workflowName(),
              "start_time" to w.createdAtEpochMs(),
              "tenant_id" to tenantId,
              "input" to input,
            )
          }
        )
      }

      config.routes.get("/api/fair_queue/pipeline") { ctx ->
        // The "concurrency manager" workflows run on the partitioned queue and carry the
        // partition key (tenant_id) natively.
        val enqueuedMgrs =
          listByStatus(
            dbos,
            "fair_queue_concurrency_manager",
            listOf(WorkflowState.ENQUEUED, WorkflowState.PENDING),
            false,
          )
        val successMgrs =
          dbos.listWorkflows(
            ListWorkflowsInput()
              .withWorkflowName(listOf("fair_queue_concurrency_manager"))
              .withStatus(listOf(WorkflowState.SUCCESS))
              .withStartTime(thirtyMinutesAgo())
              .withLoadInput(false)
              .withLoadOutput(false)
          )

        // The actual work runs on the concurrency queue. Those workflows have no partition
        // key of their own, so we inherit it from the parent manager that enqueued them.
        val pendingWork =
          listByStatus(dbos, "fair_queue_workflow", listOf(WorkflowState.PENDING), false)
        val mgrKey = enqueuedMgrs.associate { it.workflowId() to it.queuePartitionKey() }

        ctx.json(
          mapOf(
            "enqueued" to countsByTenant(enqueuedMgrs),
            "pending_concurrency" to
              pendingWork.map { w ->
                mapOf(
                  "workflow_id" to w.workflowId(),
                  "tenant_id" to (mgrKey[w.parentWorkflowId()] ?: "unknown"),
                )
              },
            "success" to countsByTenant(successMgrs),
          )
        )
      }

      config.routes.get("/api/debouncer/pipeline") { ctx ->
        // A debounced workflow waits out its window, then runs (PENDING) and completes
        // (SUCCESS). We surface the tenant and its latest input for each stage.
        // Deduplication on the tenant key means there is at most one debounce waiting per
        // tenant -- i.e. the last input submitted wins.
        val pending = listByStatus(dbos, "debouncer_workflow", listOf(WorkflowState.PENDING), true)
        val completed =
          dbos.listWorkflows(
            ListWorkflowsInput()
              .withWorkflowName(listOf("debouncer_workflow"))
              .withStatus(listOf(WorkflowState.SUCCESS))
              .withStartTime(thirtyMinutesAgo())
              .withSortDesc(true)
              .withLoadInput(true)
              .withLoadOutput(false)
          )

        ctx.json(
          mapOf(
            "delayed" to delayedDebounces(dbos),
            "pending" to debounceItems(pending),
            "completed" to debounceItems(completed),
          )
        )
      }
    }
    .start(8000)

  logger.info("Server starting on http://localhost:8000")
}
