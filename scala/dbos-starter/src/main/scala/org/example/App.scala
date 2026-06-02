package org.example

import dev.dbos.transact.DBOS
import dev.dbos.transact.StartWorkflowOptions
import dev.dbos.transact.config.DBOSConfig
import dev.dbos.transact.execution.ThrowingRunnable
import org.slf4j.LoggerFactory
import java.time.Duration
import scala.concurrent.Future

val STEPS_EVENT = "steps_event"

private val logger = LoggerFactory.getLogger("dbos-starter-scala")

private def stepOne(): Unit =
  Thread.sleep(5000)
  logger.info("Workflow {} step 1 completed!", DBOS.workflowId())

private def stepTwo(): Unit =
  Thread.sleep(5000)
  logger.info("Workflow {} step 2 completed!", DBOS.workflowId())

private def stepThree(): Unit =
  Thread.sleep(5000)
  logger.info("Workflow {} step 3 completed!", DBOS.workflowId())

// Lifts a by-name block into a ThrowingRunnable, disambiguating runStep's overloads
// (Scala can't choose between ThrowingRunnable and ThrowingSupplier for () => Unit).
private def step(f: => Unit): ThrowingRunnable[Exception] = () => f

def exampleWorkflow(dbos: DBOS): Unit =
  dbos.runStep(step(stepOne()), "stepOne")
  dbos.setEvent(STEPS_EVENT, Integer.valueOf(1))
  dbos.runStep(step(stepTwo()), "stepTwo")
  dbos.setEvent(STEPS_EVENT, Integer.valueOf(2))
  dbos.runStep(step(stepThree()), "stepThree")
  dbos.setEvent(STEPS_EVENT, Integer.valueOf(3))

// Registers a plain Scala function as a named DBOS workflow (must be called before launch).
// Returns a (taskId: String) => Unit that durably starts the workflow.
def registerWorkflow(
    dbos: DBOS,
    workflowName: String,
    f: () => Unit
): String => Unit =
  // Wrap f so it returns null rather than BoxedUnit — DBOS serializes the return
  // value via Jackson, which can't handle scala.runtime.BoxedUnit.
  val wrapper: () => AnyRef = () => { f(); null }
  val method = classOf[Function0[?]].getMethod("apply")
  val regWf = dbos
    .integration()
    .registerWorkflow(
      workflowName,
      wrapper.getClass.getName,
      null,
      wrapper,
      method,
      null,
      null
    )
  taskId =>
    dbos
      .integration()
      .startRegisteredWorkflow(
        regWf,
        Array.empty[AnyRef],
        new StartWorkflowOptions(taskId)
      )
      .getResult()

object App extends cask.MainRoutes:
  override def port = 7070
  override def host = "0.0.0.0"

  private val dbUrl = Option(System.getenv("DBOS_SYSTEM_JDBC_URL"))
    .filter(_.nonEmpty)
    .getOrElse("jdbc:postgresql://localhost:5432/dbos_starter_scala")
  private val dbUser = Option(System.getenv("PGUSER")).getOrElse("postgres")
  private val dbPassword = Option(System.getenv("PGPASSWORD")).getOrElse("dbos")

  private val dbos = new DBOS(
    DBOSConfig
      .defaults("dbos-starter-scala")
      .withDatabaseUrl(dbUrl)
      .withDbUser(dbUser)
      .withDbPassword(dbPassword)
      .withAppVersion("0.1.0")
  )
  private val startWorkflow =
    registerWorkflow(dbos, "exampleWorkflow", () => exampleWorkflow(dbos))

  @cask.get("/")
  def index() =
    val html = scala.io.Source.fromResource("index.html").mkString
    cask.Response(html, headers = Seq("Content-Type" -> "text/html"))

  @cask.get("/workflow/:taskId")
  def workflow(taskId: String) =
    Future(startWorkflow(taskId))
    ""

  @cask.get("/last_step/:taskId")
  def lastStep(taskId: String) =
    val step = dbos
      .getEvent[Integer](taskId, STEPS_EVENT, Duration.ofSeconds(0))
      .orElse(Integer.valueOf(0))
    step.toString

  @cask.post("/crash")
  def crash() =
    logger.warn("Crash endpoint called - terminating application")
    Runtime.getRuntime.halt(0)
    ""

  initialize()

  override def main(args: Array[String]): Unit =
    super.main(args) // start HTTP server first
    dbos.launch() // then connect DBOS
    Runtime.getRuntime.addShutdownHook(Thread(() => dbos.shutdown()))
    logger.info("Server started on http://localhost:7070")
    new java.util.concurrent.CountDownLatch(1)
      .await() // keep JVM alive (virtual threads are daemon)
