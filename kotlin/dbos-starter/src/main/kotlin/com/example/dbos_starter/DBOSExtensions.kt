import dev.dbos.transact.DBOS
import dev.dbos.transact.execution.ThrowingRunnable
import dev.dbos.transact.execution.ThrowingSupplier
import dev.dbos.transact.workflow.WorkflowHandle
import dev.dbos.transact.workflow.StepOptions
import dev.dbos.transact.StartWorkflowOptions

// These top level helper functions do two things:
//   1. puts the lambda paramerter last to take advantage of Kotlin's trailing lambda syntax
//   2. eliminates the generic Exception parameter since Kotlin doesn't have checked exceptions

inline fun <reified T : Any> registerWorkflows(implementation: T, instanceName: String = ""): T {
    return DBOS.registerWorkflows(T::class.java, implementation, instanceName)
}

fun runStep(name: String, block: () -> Unit) {
    DBOS.runStep(ThrowingRunnable { block() }, StepOptions(name))
}

fun runStep(options: StepOptions, block: () -> Unit) {
    DBOS.runStep(ThrowingRunnable { block() }, options)
}

fun <T> runStep(name: String, block: () -> T): T {
    return DBOS.runStep(ThrowingSupplier<T, Exception> { block() }, StepOptions(name))
}

fun <T> runStep(options: StepOptions, block: () -> T): T {
    return DBOS.runStep(ThrowingSupplier<T, Exception> { block() }, options)
}

fun <T> startWorkflow(block: () -> T): WorkflowHandle<T, Exception> {
    return DBOS.startWorkflow(ThrowingSupplier<T, Exception> { block() })
}

fun <T> startWorkflow(workflowId: String, block: () -> T): WorkflowHandle<T, Exception> {
    return DBOS.startWorkflow(ThrowingSupplier<T, Exception> { block() }, StartWorkflowOptions(workflowId))
}

fun <T> startWorkflow(options: StartWorkflowOptions, block: () -> T): WorkflowHandle<T, Exception> {
    return DBOS.startWorkflow(ThrowingSupplier<T, Exception> { block() }, options)
}

@JvmName("startWorkflowUnit")
fun startWorkflow(block: () -> Unit): WorkflowHandle<Void, Exception> {
    return DBOS.startWorkflow(ThrowingRunnable<Exception> { block() })
}

@JvmName("startWorkflowUnit")
fun startWorkflow(workflowId: String, block: () -> Unit): WorkflowHandle<Void, Exception> {
    return DBOS.startWorkflow(ThrowingRunnable<Exception> { block() }, StartWorkflowOptions(workflowId))
}

@JvmName("startWorkflowUnit")
fun startWorkflow(options: StartWorkflowOptions, block: () -> Unit): WorkflowHandle<Void, Exception> {
    return DBOS.startWorkflow(ThrowingRunnable<Exception> { block() }, options)
}
