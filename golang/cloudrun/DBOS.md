kflow is interrupted for any reason (e.g., an executor restarts or crashes), when your program restarts the workflow automatically resumes execution from the last completed step.

- If asked to add DBOS to existing code, you MUST ask which function to make a workflow. Do NOT recommend any changes until they have told you what function to make a workflow. Do NOT make a function a workflow unless SPECIFICALLY requested.
- When making a function a workflow, you should make all functions it calls steps. Do NOT change the functions in any way.
- Do NOT make functions steps unless they are DIRECTLY called by a workflow.
- If the workflow function performs a non-deterministic action, you MUST move that action to its own function and make that function a step. Examp# Build Reliable Applications With DBOS

## Guidelines

- Respond in a friendly and concise manner
- Ask clarifying questions when requirements are ambiguous
- Generate code in Golang using the DBOS library.
- You MUST import everything used in the code you generate
- You SHALL keep all code in a single file unless otherwise specified.
- DBOS does NOT stand for anything.

## Workflow Guidelines

Workflows provide durable execution so you can write programs that are resilient to any failure.
Workflows are comprised of steps, which are ordinary Golang functions called with dbos.RunAsStep.
When using DBOS workflows, you should call any function that performs complex operations or accesses external APIs or services as a step using dbos.RunAsStep.

If a worles of non-deterministic actions include accessing an external API or service, accessing files on disk, generating a random number, of getting the current time.
- Do NOT start goroutines from workflows or use select in workflows. For any complex parallel execution, you should instead use DBOS.RunWorkflow and DBOS queues to achieve the parallelism.
- DBOS workflows and steps should NOT have side effects in memory outside of their own scope. They can access global variables, but they should NOT create or update global variables or variables outside their scope.
- Do NOT call any DBOS context method (DBOS.Send, DBOS.Recv, DBOS.RunWorkflow, DBOS.RunAsStep, DBOS.Sleep, DBOS.SetEvent, DBOS.GetEvent) from a step.

## DBOS Lifecycle Guidelines

DBOS should be installed and imported from the `github.com/dbos-inc/dbos-transact-golang/dbos` package.

DBOS programs MUST have a main file (typically 'main.go') that creates all objects and workflow functions during startup.

Any DBOS program MUST create and launch a DBOS context in their main function.
All workflows must be registered and queues created BEFORE DBOS is launched

```go
func main() {
    dbosContext, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
        AppName:     "dbos-starter",
        DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
    })
    if err != nil {
        panic(fmt.Sprintf("Initializing DBOS failed: %v", err))
    }

    dbos.RegisterWorkflow(dbosContext, workflow)

    err = dbos.Launch(dbosContext)
    if err != nil {
        panic(fmt.Sprintf("Launching DBOS failed: %v", err))
    }
    defer dbos.Shutdown(dbosContext, 5 * time.Second)
}
```

Here is an example main function using Gin:

```go
import (
    "context"
    "fmt"
    "net/http"
    "os"
    "time"

    "github.com/dbos-inc/dbos-transact-golang/dbos"
    "github.com/gin-gonic/gin"
)

func main() {
    dbosContext, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
        AppName:     "dbos-starter",
        DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
    })
    if err != nil {
        panic(fmt.Sprintf("Initializing DBOS failed: %v", err))
    }

    dbos.RegisterWorkflow(dbosContext, workflow)

    err = dbos.Launch(dbosContext)
    if err != nil {
        panic(fmt.Sprintf("Launching DBOS failed: %v", err))
    }
    defer dbos.Shutdown(dbosContext, 5 * time.Second)

    r := gin.Default()

    r.GET("/", func(c *gin.Context) {
        dbos.RunWorkflow(dbosContext, workflow, "")
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Error in DBOS workflow: %v", err)})
            return
        }
        c.Status(http.StatusOK)
    })

    r.Run(":8080")
}
```

## Workflow and Steps Examples

Simple example:

```go showLineNumbers title="main.go"
package main

import (
    "context"
    "fmt"
    "os"
    "time"

    "github.com/dbos-inc/dbos-transact-golang/dbos"
)

func workflow(ctx dbos.DBOSContext, _ string) (string, error) {
    _, err := dbos.RunAsStep(ctx, stepOne)
    if err != nil {
        return "failure", err
    }
    _, err = dbos.RunAsStep(ctx, stepTwo)
    if err != nil {
        return "failure", err
    }
    return "success", err
}

func stepOne(ctx context.Context) (string, error) {
    fmt.Println("Step one completed")
    return "success", nil
}

func stepTwo(ctx context.Context) (string, error) {
    fmt.Println("Step two completed")
    return "success", nil
}

func main() {
    dbosContext, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
        AppName:     "dbos-starter",
        DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
    })
    if err != nil {
        panic(fmt.Sprintf("Initializing DBOS failed: %v", err))
    }

    dbos.RegisterWorkflow(dbosContext, workflow)

    err = dbos.Launch(dbosContext)
    if err != nil {
        panic(fmt.Sprintf("Launching DBOS failed: %v", err))
    }
    defer dbos.Shutdown(dbosContext, 5 * time.Second)

    handle, err := dbos.RunWorkflow(dbosContext, workflow, "")
    if err != nil {
        panic(fmt.Sprintf("Error in DBOS workflow: %v", err))
    }
    result, err := handle.GetResult()
    if err != nil {
        panic(fmt.Sprintf("Error in DBOS workflow: %v", err))
    }
    fmt.Println("Workflow result:", result)
}
```

Example with Gin:

```go showLineNumbers title="main.go"
package main

import (
    "context"
    "fmt"
    "net/http"
    "os"
    "time"

    "github.com/dbos-inc/dbos-transact-golang/dbos"
    "github.com/gin-gonic/gin"
)

func workflow(ctx dbos.DBOSContext, _ string) (string, error) {
    _, err := dbos.RunAsStep(ctx, stepOne)
    if err != nil {
        return "failure", err
    }
    for range 5 {
        fmt.Println("Press Control + C to stop the app...")
        dbos.Sleep(ctx, time.Second)
    }
    _, err = dbos.RunAsStep(ctx, stepTwo)
    if err != nil {
        return "failure", err
    }
    return "success", err
}

func stepOne(ctx context.Context) (string, error) {
    fmt.Println("Step one completed")
    return "success", nil
}

func stepTwo(ctx context.Context) (string, error) {
    fmt.Println("Step two completed")
    return "success", nil
}

func main() {
    dbosContext, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
        AppName:     "dbos-starter",
        DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
    })
    if err != nil {
        panic(fmt.Sprintf("Initializing DBOS failed: %v", err))
    }

    dbos.RegisterWorkflow(dbosContext, workflow)

    err = dbos.Launch(dbosContext)
    if err != nil {
        panic(fmt.Sprintf("Launching DBOS failed: %v", err))
    }
    defer dbos.Shutdown(dbosContext, 5 * time.Second)

    r := gin.Default()

    r.GET("/", func(c *gin.Context) {
        dbos.RunWorkflow(dbosContext, workflow, "")
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Error in DBOS workflow: %v", err)})
            return
        }
        c.Status(http.StatusOK)
    })

    r.Run(":8080")
}
```

Example with queues:

```go showLineNumbers title="main.go"
package main

import (
    "context"
    "fmt"
    "net/http"
    "os"
    "time"

    "github.com/dbos-inc/dbos-transact-golang/dbos"
    "github.com/gin-gonic/gin"
)

func taskWorkflow(ctx dbos.DBOSContext, i int) (int, error) {
    dbos.Sleep(ctx, 5*time.Second)
    fmt.Printf("Task %d completed\n", i)
    return i, nil
}

func queueWorkflow(ctx dbos.DBOSContext, queue dbos.WorkflowQueue) (int, error) {
    fmt.Println("Enqueuing tasks")
    handles := make([]dbos.WorkflowHandle[int], 10)
    for i := range 10 {
        handle, err := dbos.RunWorkflow(ctx, taskWorkflow, i, dbos.WithQueue(queue.Name))
        if err != nil {
            return 0, err
        }
        handles[i] = handle
    }
    results := make([]int, 10)
    for i, handle := range handles {
        result, err := handle.GetResult()
        if err != nil {
            return 0, err
        }
        results[i] = result
    }
    fmt.Printf("Successfully completed %d tasks\n", len(results))
    return len(results), nil
}

func main() {
    dbosContext, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
        AppName:     "dbos-starter",
        DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
    })
    if err != nil {
        panic(fmt.Sprintf("Initializing DBOS failed: %v", err))
    }

    queue := dbos.NewWorkflowQueue(dbosContext, "queue")
    dbos.RegisterWorkflow(dbosContext, queueWorkflow)
    dbos.RegisterWorkflow(dbosContext, taskWorkflow)

    err = dbos.Launch(dbosContext)
    if err != nil {
        panic(fmt.Sprintf("Launching DBOS failed: %v", err))
    }
    defer dbos.Shutdown(dbosContext, 5 * time.Second)

    r := gin.Default()

    r.GET("/", func(c *gin.Context) {
        dbos.RunWorkflow(dbosContext, queueWorkflow, queue)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Error in DBOS workflow: %v", err)})
            return
        }
        c.Status(http.StatusOK)
    })

    r.Run(":8080")
}
```

## Workflow Documentation

Workflows provide **durable execution** so you can write programs that are **resilient to any failure**.
Workflows are comprised of steps, which wrap ordinary Go functions.
If a workflow is interrupted for any reason (e.g., an executor restarts or crashes), when your program restarts the workflow automatically resumes execution from the last completed step.

To write a workflow, register a Go function with `RegisterWorkflow`.
Workflow registration must happen before launching the DBOS context with `dbos.Launch()`
The function's signature must match:

```go
type Workflow[P any, R any] func(ctx DBOSContext, input P) (R, error)
```

In other words, a workflow must take in a DBOS context and one other input of any serializable (json-encodable) type and must return one output of any serializable type and error.

For example:

```go
func stepOne(ctx context.Context) (string, error) {
    fmt.Println("Step one completed")
    return "success", nil
}

func stepTwo(ctx context.Context) (string, error) {
    fmt.Println("Step two completed")
    return "success", nil
}

func workflow(ctx dbos.DBOSContext, _ string) (string, error) {
    _, err := dbos.RunAsStep(ctx, stepOne)
    if err != nil {
        return "failure", err
    }
    _, err = dbos.RunAsStep(ctx, stepTwo)
    if err != nil {
        return "failure", err
    }
    return "success", err
}

func main() {
    ... // Create the DBOS context
    dbos.RegisterWorkflow(dbosContext, workflow)
    ... // Launch DBOS after registering all workflows
}
```

Call workflows with `RunWorkflow`.
This starts the workflow in the background and returns a workflow handle from which you can access information about the workflow or wait for it to complete and return its result.

Here's an example:

```go
func runWorkflowExample(dbosContext dbos.DBOSContext, input string) error {
    handle, err := dbos.RunWorkflow(dbosContext, workflow, input)
    if err != nil {
        return err
    }
    result, err := handle.GetResult()
    if err != nil {
        return err
    }
    fmt.Println("Workflow result:", result)
    return nil
}
```

### Workflow IDs and Idempotency

Every time you execute a workflow, that execution is assigned a unique ID, by default a UUID.
You can access this ID through `GetWorkflowID`, or from the handle's `GetWorkflowID` method.
Workflow IDs are useful for communicating with workflows and developing interactive workflows.

You can set the workflow ID of a workflow using `WithWorkflowID` when calling `RunWorkflow`.
Workflow IDs must be **globally unique** for your application.
An assigned workflow ID acts as an idempotency key: if a workflow is called multiple times with the same ID, it executes only once.
This is useful if your operations have side effects like making a payment or sending an email.
For example:

```go
func exampleWorkflow(ctx dbos.DBOSContext, input string) (string, error) {
    workflowID, err := dbos.GetWorkflowID(ctx)
    if err != nil {
        return "", err
    }
    fmt.Printf("Running workflow with ID: %s\n", workflowID)
    // ...
    return "success", nil
}

func example(dbosContext dbos.DBOSContext, input string) error {    
    myID := "unique-workflow-id-123"
    handle, err := dbos.RunWorkflow(dbosContext, exampleWorkflow, input, dbos.WithWorkflowID(myID))
    if err != nil {
        log.Fatal(err)
    }
    result, err := handle.GetResult()
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("Result:", result)
    return nil
}
```

### Determinism

Workflows are in most respects normal Go functions.
They can have loops, branches, conditionals, and so on.
However, a workflow function must be **deterministic**: if called multiple times with the same inputs, it should invoke the same steps with the same inputs in the same order (given the same return values from those steps).
If you need to perform a non-deterministic operation like accessing the database, calling a third-party API, generating a random number, or getting the local time, you shouldn't do it directly in a workflow function.
Instead, you should do all database operations in non-deterministic operations in steps.

:::warning
Go's goroutine scheduler and `select` operation are non-deterministic. You should use them only inside steps.
:::

For example, **don't do this**:

```go
func exampleWorkflow(ctx dbos.DBOSContext, input string) (string, error) {
    randomChoice := rand.Intn(2)
    if randomChoice == 0 {
        return dbos.RunAsStep(ctx, stepOne)
    } else {
        return dbos.RunAsStep(ctx, stepTwo)
    }
}
```

Instead, do this:

```go
func generateChoice(ctx context.Context) (int, error) {
    return rand.Intn(2), nil
}

func exampleWorkflow(ctx dbos.DBOSContext, input string) (string, error) {
    randomChoice, err := dbos.RunAsStep(ctx, generateChoice)
    if err != nil {
        return "", err
    }
    if randomChoice == 0 {
        return dbos.RunAsStep(ctx, stepOne)
    } else {
        return dbos.RunAsStep(ctx, stepTwo)
    }
}
```

### Workflow Timeouts

You can set a timeout for a workflow using its input `DBOSContext`. Use `WithTimeout` to obtain a cancellable `DBOSContext`, as you would with a normal `context.Context`.

When the timeout expires, the workflow and all its children are cancelled. Cancelling a workflow sets its status to CANCELLED and preempts its execution at the beginning of its next step. You can detach a child workflow by passing it an uncancellable context, which you can obtain with `WithoutCancel`.

Timeouts are **start-to-completion**: if a workflow is enqueued, the timeout does not begin until the workflow is dequeued and starts execution. Also, timeouts are durable: they are stored in the database and persist across restarts, so workflows can have very long timeouts.

```go
func exampleWorkflow(ctx dbos.DBOSContext, input string) (string, error) {}

timeoutCtx, cancelFunc := dbos.WithTimeout(dbosCtx, 12*time.Hour)
handle, err := RunWorkflow(timeoutCtx, exampleWorkflow, "wait-for-cancel")
```

You can also manually cancel the workflow by calling its `cancel` function (or calling CancelWorkflow).


### Durable Sleep

You can use `Sleep` to put your workflow to sleep for any period of time.
This sleep is **durable**&mdash;DBOS saves the wakeup time in the database so that even if the workflow is interrupted and restarted multiple times while sleeping, it still wakes up on schedule.

Sleeping is useful for scheduling a workflow to run in the future (even days, weeks, or months from now).
For example:

```go
func runTask(ctx dbos.DBOSContext, task string) (string, error) {
	// Execute the task...
	return "task completed", nil
}

func exampleWorkflow(ctx dbos.DBOSContext, input struct {
	TimeToSleep time.Duration
	Task        string
}) (string, error) {
	// Sleep for the specified duration
	_, err := dbos.Sleep(ctx, input.TimeToSleep)
	if err != nil {
		return "", err
	}

	// Execute the task after sleeping
	result, err := dbos.RunAsStep(
		ctx,
		func(stepCtx context.Context) (string, error) {
			return runTask(ctx, input.Task)
		},
	)
	if err != nil {
		return "", err
	}

	return result, nil
}

```

### Scheduled Workflows

You can schedule workflows to run automatically at specified times using cron syntax with seconds precision.
Scheduled workflows are useful for running recurring tasks like data backups, report generation, or cleanup operations.

To create a scheduled workflow, use `WithSchedule` when registering your workflow.
The workflow must have a single `time.Time` input parameter, representing the scheduled execution time.

**Example syntax:**

```go
func frequentTask(ctx dbos.DBOSContext, scheduledTime time.Time) (string, error) {
    fmt.Printf("Performing a scheduled task at: %s\n", scheduledTime.Format(time.RFC3339))
    ... // Perform a scheduled task operations
    return result, nil
}

func dailyBackup(ctx dbos.DBOSContext, scheduledTime time.Time) (string, error) {
    fmt.Printf("Running daily backup at: %s\n", scheduledTime.Format(time.RFC3339))
    ... // Perform daily backup operations
    return result, nil
}

func main() {
    dbosContext := ... // Initialize DBOS

    // Register a workflow to run daily at 2:00 AM
    dbos.RegisterWorkflow(dbosContext, dailyBackup, 
        dbos.WithSchedule("0 0 2 * * *")) // Cron: daily at 2:00 AM
    
    // Register a workflow to run every 15 minutes
    dbos.RegisterWorkflow(dbosContext, frequentTask,
        dbos.WithSchedule("0 */15 * * * * ")) // Cron: every 15 minutes
    
    // Launch DBOS - scheduled workflows will start automatically
    err := dbos.Launch(dbosContext)
    if err != nil {
        log.Fatal(err)
    }
}
```

### Workflow Versioning and Recovery

Because DBOS recovers workflows by re-executing them using information saved in the database, a workflow cannot safely be recovered if its code has changed since the workflow was started.
To guard against this, DBOS _versions_ applications and their workflows.
When DBOS is launched, it computes an application version from a hash of the application source code (this can be overridden through configuration).
All workflows are tagged with the application version on which they started.

When DBOS tries to recover workflows, it only recovers workflows whose version matches the current application version.
This prevents unsafe recovery of workflows that depend on different code.
You cannot change the version of a workflow, but you can use `ForkWorkflow` to restart a workflow from a specific step on a specific code version.

For more information on managing workflow recovery when self-hosting production DBOS applications, check out the guide.


## Steps

When using DBOS workflows, you should call any function that performs complex operations or accesses external APIs or services as a _step_.
If a workflow is interrupted, upon restart it automatically resumes execution from the **last completed step**.

You can use `RunAsStep` to call a function as a step.
For a function to be used as a step, it should return a serializable (json-encodable) value and an error and have this signature:

```go
type Step[R any] func(ctx context.Context) (R, error)
```

Here's a simple example:

```go
func generateRandomNumber(ctx context.Context) (int, error) {
    return rand.Int(), nil
}

func workflowFunction(ctx dbos.DBOSContext, n int) (int, error) {
    randomNumber, err := dbos.RunAsStep(
        ctx,
        generateRandomNumber,
        dbos.WithStepName("generateRandomNumber"),
    )
    if err != nil {
        return 0, err
    }
    return randomNumber, nil
}
```

You can pass arguments into a step by wrapping it in an anonymous function, like this:

```go
func generateRandomNumber(ctx context.Context, n int) (int, error) {
    return rand.IntN(n), nil
}

func workflowFunction(ctx dbos.DBOSContext, n int) (int, error) {
    randomNumber, err := dbos.RunAsStep(
        ctx,
        func(stepCtx context.Context) (int, error) {
            return generateRandomNumber(stepCtx, n)
        },
        dbos.WithStepName("generateRandomNumber")
    )
    if err != nil {
        return 0, err
    }
    return randomNumber, nil
}
```

You should make a function a step if you're using it in a DBOS workflow and it performs a **nondeterministic** operation.
A nondeterministic operation is one that may return different outputs given the same inputs.
Common nondeterministic operations include:

- Accessing an external API or service, like serving a file from AWS S3, calling an external API like Stripe, or accessing an external data store like Elasticsearch.
- Accessing files on disk.
- Generating a random number.
- Getting the current time.

You **cannot** call, start, or enqueue workflows from within steps.
You also cannot call DBOS methods like `Send` or `SetEvent` from within steps.
These operations should be performed from workflow functions.
You can call one step from another step, but the called step becomes part of the calling step's execution rather than functioning as a separate step.

### Configurable Retries

You can optionally configure a step to automatically retry any error a set number of times with exponential backoff.
This is useful for automatically handling transient failures, like making requests to unreliable APIs.
Retries are configurable through step options that can be passed to `RunAsStep`.

Available retry configuration options include:
- `WithStepName` - Custom name for the step (default to the Go runtime reflection value)
- `WithStepMaxRetries` - Maximum number of times this step is automatically retried on failure (default 0)
- `WithMaxInterval` - Maximum delay between retries (default 5s)
- `WithBackoffFactor` - Exponential backoff multiplier between retries (default 2.0)
- `WithBaseInterval` - Initial delay between retries (default 100ms)

For example, let's configure this step to retry failures (such as if the site to be fetched is temporarily down) up to 10 times:

```go
func fetchStep(ctx context.Context, url string) (string, error) {
    resp, err := http.Get(url)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return "", err
    }

    return string(body), nil
}

func fetchWorkflow(ctx dbos.DBOSContext, inputURL string) (string, error) {
    return dbos.RunAsStep(
        ctx,
        func(stepCtx context.Context) (string, error) {
            return fetchStep(stepCtx, inputURL)
        },
        dbos.WithStepName("fetchFunction"),
        dbos.WithStepMaxRetries(10),
        dbos.WithMaxInterval(30*time.Second),
        dbos.WithBackoffFactor(2.0),
        dbos.WithBaseInterval(500*time.Millisecond),
    )
}
```

If a step exhausts all retry attempts, it returns an error to the calling workflow.

## Workflow Communication

DBOS provides a few different ways to communicate with your workflows.
You can:

- Send messages to workflows
- Publish events from workflows for clients to read


### Workflow Messaging and Notifications
You can send messages to a specific workflow.
This is useful for signaling a workflow or sending notifications to it while it's running.

<img src={require('@site/static/img/workflow-communication/workflow-messages.png').default} alt="DBOS Steps" width="750" className="custom-img"/>

### Send

```go
func SendP any error
```

You can call `Send()` to send a message to a workflow.
Messages can optionally be associated with a topic and are queued on the receiver per topic.

### Recv

```go
func RecvR any (R, error)
```

Workflows can call `Recv()` to receive messages sent to them, optionally for a particular topic.
Each call to `Recv()` waits for and consumes the next message to arrive in the queue for the specified topic, returning an error if the wait times out.
If the topic is not specified, this method only receives messages sent without a topic.

### Messages Example

Messages are especially useful for sending notifications to a workflow.
For example, in an e-commerce application, the checkout workflow, after redirecting customers to a secure payments service, must wait for a notification from that service that the payment has finished processing.

To wait for this notification, the payments workflow uses `Recv()`, executing failure-handling code if the notification doesn't arrive in time:

```go
const PaymentStatusTopic = "payment_status"

func checkoutWorkflow(ctx dbos.DBOSContext, orderData OrderData) (string, error) {
    // Process initial checkout steps...

    // Wait for payment notification with a 5-minute timeout
    notification, err := dbos.RecvPaymentNotification
    if err != nil {
        ... // Handle timeout or other errors
    }

    // Handle the notification
    if notification.Status == "completed" {
      ... // Handle the notification.
    } else {
      ... // Handle a failure
    }
}
```

A webhook waits for the payment processor to send the notification, then uses `Send()` to forward it to the workflow:

```go
func paymentWebhookHandler(w http.ResponseWriter, r *http.Request) {
    // Parse the notification from the payment processor
    notification := ...
    // Retrieve the workflow ID from notification metadata
    workflowID := ...

    // Send the notification to the waiting workflow
    err := dbos.Send(dbosContext, workflowID, notification, PaymentStatusTopic)
    if err != nil {
        http.Error(w, "Failed to send notification", http.StatusInternalServerError)
        return
    }
}
```

### Reliability Guarantees

All messages are persisted to the database, so if `Send` completes successfully, the destination workflow is guaranteed to be able to `Recv` it.
If you're sending a message from a workflow, DBOS guarantees exactly-once delivery.

### Workflow Events

Workflows can publish _events_, which are key-value pairs associated with the workflow.
They are useful for publishing information about the status of a workflow or to send a result to clients while the workflow is running.

<img src={require('@site/static/img/workflow-communication/workflow-events.png').default} alt="DBOS Steps" width="750" className="custom-img"/>

### SetEvent

```go
func SetEventP any error
```

Any workflow can call `SetEvent` to publish a key-value pair, or update its value if has already been published.

### GetEvent

```go
func GetEventR any (R, error)
```

You can call `GetEvent` to retrieve the value published by a particular workflow ID for a particular key.
If the event does not yet exist, this call waits for it to be published, returning an error if the wait times out.

### Events Example

Events are especially useful for writing interactive workflows that communicate information to their caller.
For example, in an e-commerce application, the checkout workflow, after validating an order, directs the customer to a secure payments service to handle credit card processing.
To communicate the payments URL to the customer, it uses events.

The checkout workflow emits the payments URL using `SetEvent()`:

```go
const PaymentURLKey = "payment_url"

func checkoutWorkflow(ctx dbos.DBOSContext, orderData OrderData) (string, error) {
    // Process order validation...

    paymentsURL := ...
    err := dbos.SetEvent(ctx, PaymentURLKey, paymentsURL)
    if err != nil {
        return "", fmt.Errorf("failed to set payment URL event: %w", err)
    }

    // Continue with checkout process...
}
```

The HTTP handler that originally started the workflow uses `GetEvent()` to await this URL, then redirects the customer to it:

```go
func webCheckoutHandler(dbosContext dbos.DBOSContext, w http.ResponseWriter, r *http.Request) {
    orderData := parseOrderData(r) // Parse order from request

    handle, err := dbos.RunWorkflow(dbosContext, checkoutWorkflow, orderData)
    if err != nil {
        http.Error(w, "Failed to start checkout", http.StatusInternalServerError)
        return
    }

    // Wait up to 30 seconds for the payment URL event
    url, err := dbos.GetEventstring, PaymentURLKey, 30*time.Second)
    if err != nil {
        // Handle a timeout
    }

    // Redirect the customer
}
```

### Reliability Guarantees

All events are persisted to the database, so the latest version of an event is always retrievable.
Additionally, if `GetEvent` is called in a workflow, the retrieved value is persisted in the database so workflow recovery can use that value, even if the event is later updated.


## Queues


You can use queues to run many workflows at once with managed concurrency.
Queues provide _flow control_, letting you manage how many workflows run at once or how often workflows are started.

To create a queue, use `NewWorkflowQueue`

```go
queue := dbos.NewWorkflowQueue(dbosContext, "example_queue")
```

You can then enqueue any workflow using `WithQueue` when calling `RunWorkflow`.
Enqueuing a function submits it for execution and returns a handle to it.
Queued tasks are started in first-in, first-out (FIFO) order.

```go
func processTask(ctx dbos.DBOSContext, task string) (string, error) {
    // Process the task...
    return fmt.Sprintf("Processed: %s", task), nil
}

func example(dbosContext dbos.DBOSContext, queue dbos.WorkflowQueue) error {
    // Enqueue a workflow
    task := "example_task"
    handle, err := dbos.RunWorkflow(dbosContext, processTask, task, dbos.WithQueue(queue.Name))
    if err != nil {
        return err
    }
    
    // Get the result
    result, err := handle.GetResult()
    if err != nil {
        return err
    }
    fmt.Println("Task result:", result)
    return nil
}
```

### Queue Example

Here's an example of a workflow using a queue to process tasks concurrently:

```go
func taskWorkflow(ctx dbos.DBOSContext, task string) (string, error) {
    // Process the task...
    return fmt.Sprintf("Processed: %s", task), nil
}

func queueWorkflow(ctx dbos.DBOSContext, queue dbos.WorkflowQueue) ([]string, error) {
    // Enqueue each task so all tasks are processed concurrently
    tasks := []string{"task1", "task2", "task3", "task4", "task5"}

    var handles []dbos.WorkflowHandle[string]
    for _, task := range tasks {
        handle, err := dbos.RunWorkflow(ctx, taskWorkflow, task, dbos.WithQueue(queue.Name))
        if err != nil {
            return nil, fmt.Errorf("failed to enqueue task %s: %w", task, err)
        }
        handles = append(handles, handle)
    }

    // Wait for each task to complete and retrieve its result
    var results []string
    for i, handle := range handles {
        result, err := handle.GetResult()
        if err != nil {
            return nil, fmt.Errorf("task %d failed: %w", i, err)
        }
        results = append(results, result)
    }

    return results, nil
}

func example(dbosContext dbos.DBOSContext, queue dbos.WorkflowQueue) error {
    handle, err := dbos.RunWorkflow(dbosContext, queueWorkflow, queue)
    if err != nil {
        return err
    }

    results, err := handle.GetResult()
    if err != nil {
        return err
    }

    for _, result := range results {
        fmt.Println(result)
    }
    return nil
}
```

### Enqueueing from Another Application

Often, you want to enqueue a workflow from outside your DBOS application.
For example, let's say you have an API server and a data processing service.
You're using DBOS to build a durable data pipeline in the data processing service.
When the API server receives a request, it should enqueue the data pipeline for execution on the data processing service.

You can use the DBOS Client to enqueue workflows from outside your DBOS application by connecting directly to your DBOS application's system database.
Since the DBOS Client is designed to be used from outside your DBOS application, workflow and queue metadata must be specified explicitly.

For example, this code enqueues the `dataPipeline` workflow on the `pipelineQueue` queue with a `ProcessInput` argument:

```go
type ProcessInput struct {
    TaskID string
    Data   string
}

type ProcessOutput struct {
    Result string
    Status string
}

config := dbos.ClientConfig{
    DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
}
client, err := dbos.NewClient(context.Background(), config)
if err != nil {
    log.Fatal(err)
}
defer client.Shutdown(5 * time.Second)

handle, err := dbos.Enqueue[ProcessInput, ProcessOutput](
    client, 
    "pipelineQueue",
    "dataPipeline",
    ProcessInput{TaskID: "task-123", Data: "data"},
)
if err != nil {
    log.Fatal(err)
}
```


### Managing Concurrency

You can control how many workflows from a queue run simultaneously by configuring concurrency limits.
This helps prevent resource exhaustion when workflows consume significant memory or processing power.

#### Worker Concurrency

Worker concurrency sets the maximum number of workflows from a queue that can run concurrently on a single DBOS process.
This is particularly useful for resource-intensive workflows to avoid exhausting the resources of any process.
For example, this queue has a worker concurrency of 5, so each process will run at most 5 workflows from this queue simultaneously:

```go
queue := dbos.NewWorkflowQueue(dbosContext, "example_queue",  dbos.WithWorkerConcurrency(5))
```

#### Global Concurrency

Global concurrency limits the total number of workflows from a queue that can run concurrently across all DBOS processes in your application.
For example, this queue will have a maximum of 10 workflows running simultaneously across your entire application.

:::warning
Worker concurrency limits are recommended for most use cases.
Take care when using a global concurrency limit as any `PENDING` workflow on the queue counts toward the limit, including workflows from previous application versions
:::

```go
queue := dbos.NewWorkflowQueue(dbosContext, "example_queue", dbos.WithGlobalConcurrency(10))
```

### Rate Limiting

You can set _rate limits_ for a queue, limiting the number of functions that it can start in a given period.
Rate limits are global across all DBOS processes using this queue.
For example, this queue has a limit of 100 workflows with a period of 60 seconds, so it may not start more than 100 workflows in 60 seconds:

```go
queue := dbos.NewWorkflowQueue(dbosContext, "example_queue", 
    dbos.WithRateLimiter(&dbos.RateLimiter{
        Limit:  100,
        Period: 60.0, // 60 seconds
    }))
```

Rate limits are especially useful when working with a rate-limited API, such as many LLM APIs.


### Deduplication

You can set a deduplication ID for an enqueued workflow using `WithDeduplicationID` when calling `RunWorkflow`.
At any given time, only one workflow with a specific deduplication ID can be enqueued in the specified queue.
If a workflow with a deduplication ID is currently enqueued or actively executing (status `ENQUEUED` or `PENDING`), subsequent workflow enqueue attempts with the same deduplication ID in the same queue will return an error.

For example, this is useful if you only want to have one workflow active at a time per user&mdash;set the deduplication ID to the user's ID.

**Example syntax:**

```go
func taskWorkflow(ctx dbos.DBOSContext, task string) (string, error) {
    // Process the task...
    return "completed", nil
}

func example(dbosContext dbos.DBOSContext, queue dbos.WorkflowQueue) error {
    task := "example_task"
    deduplicationID := "user_12345" // Use user ID for deduplication
    
    handle, err := dbos.RunWorkflow(
        dbosContext, taskWorkflow, task,
        dbos.WithQueue(queue.Name),
        dbos.WithDeduplicationID(deduplicationID))
    if err != nil {
        // Handle deduplication error or other failures
        return fmt.Errorf("failed to enqueue workflow: %w", err)
    }
    
    result, err := handle.GetResult()
    if err != nil {
        return fmt.Errorf("workflow failed: %w", err)
    }
    
    fmt.Printf("Workflow completed: %s\n", result)
    return nil
}
```

### Priority

You can set a priority for an enqueued workflow using `WithPriority` when calling `RunWorkflow`.
Workflows with the same priority are dequeued in **FIFO (first in, first out)** order. Priority values can range from `1` to `2,147,483,647`, where **a low number indicates a higher priority**.
If using priority, you must set `WithPriorityEnabled` on your queue.

:::tip
Workflows without assigned priorities have the highest priority and are dequeued before workflows with assigned priorities.
:::

To use priorities in a queue, you must enable it when creating the queue:

```go
queue := dbos.NewWorkflowQueue(dbosContext, "example_queue", dbos.WithPriorityEnabled())
```

**Example syntax:**

```go
func taskWorkflow(ctx dbos.DBOSContext, task string) (string, error) {
    // Process the task...
    return "completed", nil
}

func example(dbosContext dbos.DBOSContext, queue dbos.WorkflowQueue) error {
    task := "example_task"
    priority := uint(10) // Lower number = higher priority
    
    handle, err := dbos.RunWorkflow(dbosContext, taskWorkflow, task,
        dbos.WithQueue(queue.Name),
        dbos.WithPriority(priority))
    if err != nil {
        return err
    }
    
    result, err := handle.GetResult()
    if err != nil {
        return fmt.Errorf("workflow failed: %w", err)
    }
    
    fmt.Printf("Workflow completed: %s\n", result)
    return nil
}
```


# Reference

A DBOS Context is at the center of a DBOS-enabled application. Use it to register workflows, queues and perform workflow management tasks.

`DBOSContext` extends Go's `context.Context` interface and carries essential state across workflow execution. Workflows and steps receive a new `DBOSContext` spun out of the root `DBOSContext` you manage. In addition, a `DBOSContext` can be used to set workflow timeouts.

## Lifecycle
### Initialization

You can create a DBOS context using `NewDBOSContext`, which takes a `Config` object where `AppName` and one of `DatabaseURL` or `SystemDBPool` are mandatory.

```go
func NewDBOSContext(ctx context.Context, inputConfig Config) (DBOSContext, error)
```

```go
type Config struct {
    AppName            string        // Application name for identification (required)
    DatabaseURL        string        // DatabaseURL is a PostgreSQL connection string to your system database. Either this or SystemDBPool is required.
    SystemDBPool       *pgxpool.Pool // SystemDBPool is a connection pool DBOS can use to access your system database. Optional but takes precedence over DatabaseURL if both are provided.
    DatabaseSchema     string        // Database schema name (defaults to "dbos")
    Logger             *slog.Logger  // Custom logger instance (defaults to a new slog logger)
    AdminServer        bool          // Enable Transact admin HTTP server (disabled by default)
    AdminServerPort    int           // Port for the admin HTTP server (default: 3001)
    ConductorURL       string        // DBOS conductor service URL (optional)
    ConductorAPIKey    string        // DBOS conductor API key (optional)
    ApplicationVersion string        // Application version (optional)
    ExecutorID         string        // Executor ID (optional)
}
```

For example:
```go
dbosContext, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
    AppName:     "dbos-starter",
    DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
})
if err != nil {
    panic(err)
}
```

The newly created DBOSContext must be launched with `Launch()` before use and should be shut down with Shutdown() at program termination.

### launch

```go
dbos.Launch(ctx DBOSContext) error
```

Launch the following resources managed by a `DBOSContext`:
- A system database connection pool
- A workflow scheduler
- A workflow queue runner
- (Optionally) an admin server
- (Optionally) a Conductor connection

In addition, `Launch()` may perform workflow recovery.
`Launch()` should be called by your program during startup before running any workflows.

### Shutdown
```go
dbos.Shutdown(ctx DBOSContext, timeout time.Duration)
```

Gracefully shutdown the DBOS runtime, waiting for workflows to complete and cleaning up resources. When you shutdown a `DBOSContext`, the underlying `context.Context` will be cancelled, which signals all DBOS resources they should stop executing, including workflows and steps.

**Parameters:**
- **timeout**: The time to wait for DBOS resources to gracefully terminate.

## Context management

### WithTimeout

```go
func WithTimeout(ctx DBOSContext, timeout time.Duration) (DBOSContext, context.CancelFunc)
```

`WithTimeout` returns a copy of the DBOS context with a timeout. The returned context will be canceled after the specified duration. See workflow timeouts for usage.

### WithoutCancel

```go
func WithoutCancel(ctx DBOSContext) DBOSContext
```

`WithoutCancel` returns a copy of the DBOS context that is not canceled when the parent context is canceled. This is useful to detach child workflows from their parent's timeout.

## Context metadata
### GetApplicationVersion

```go
func GetApplicationVersion() string
```

`GetApplicationVersion` returns the application version for this context.

### GetExecutorID

```go
func GetExecutorID() string
```

`GetExecutorID` returns the executor ID for this context.


## DBOS Methods

### GetEvent

```go
func GetEventR any (R, error)
```

Retrieve the latest value of an event published by the workflow identified by `targetWorkflowID` to the key `key`.
If the event does not yet exist, wait for it to be published, an error if the wait times out.

**Parameters:**
- **ctx**: The DBOS context.
- **targetWorkflowID**: The identifier of the workflow whose events to retrieve.
- **key**: The key of the event to retrieve.
- **timeout**: A timeout. If the wait times out, return an error.


### SetEvent

```go
func SetEventP any error
```
Create and associate with this workflow an event with key `key` and value `value`.
If the event already exists, update its value.
Can only be called from within a workflow.

**Parameters:**
- **ctx**: The DBOS context.
- **key**: The key of the event.
- **message**: The value of the event. Must be serializable.


### Send

```go
func SendP any error
```
Send a message to the workflow identified by `destinationID`.
Messages can optionally be associated with a topic.

**Parameters:**
- **ctx**: The DBOS context.
- **destinationID**: The workflow to which to send the message.
- **message**: The message to send. Must be serializable.
- **topic**: A topic with which to associate the message. Messages are enqueued per-topic on the receiver.

### Recv

```go
func RecvR any (R, error)
```

Receive and return a message sent to this workflow.
Can only be called from within a workflow.
Messages are dequeued first-in, first-out from a queue associated with the topic.
Calls to `recv` wait for the next message in the queue, returning an error if the wait times out.

**Parameters:**
- **ctx**: The DBOS context.
- **topic**: A topic queue on which to wait.
- **timeoutSeconds**: A timeout in seconds. If the wait times out, return an error.

### Sleep

```go
func Sleep(ctx DBOSContext, duration time.Duration) (time.Duration, error)
```

Sleep for the given duration.
May only be called from within a workflow.
This sleep is durable&mdash;it records its intended wake-up time in the database so if it is interrupted and recovers, it still wakes up at the intended time.

**Parameters:**
- **ctx**: The DBOS context.
- **duration**: The duration to sleep.

### RetrieveWorkflow

```go
func RetrieveWorkflowR any (*workflowPollingHandle[R], error)
```

Retrieve the handle of a workflow.

**Parameters**:
- **ctx**: The DBOS context.
- **workflowID**: The ID of the workflow whose handle to retrieve.

## Workflow Management Methods

### ListWorkflows

```go
func ListWorkflows(ctx DBOSContext, opts ...ListWorkflowsOption) ([]WorkflowStatus, error)
```

Retrieve a list of `WorkflowStatus` of all workflows matching specified criteria.

**Example usage:**

```go
// List all successful workflows from the last 24 hours
workflows, err := dbos.ListWorkflows(ctx,
    dbos.WithStatus([]dbos.WorkflowStatusType{dbos.WorkflowStatusSuccess}),
    dbos.WithStartTime(time.Now().Add(-24*time.Hour)),
    dbos.WithLimit(100))
if err != nil {
    log.Fatal(err)
}

// List workflows by specific IDs without loading input/output data
workflows, err := dbos.ListWorkflows(ctx,
    dbos.WithWorkflowIDs([]string{"workflow1", "workflow2"}),
    dbos.WithLoadInput(false),
    dbos.WithLoadOutput(false))
if err != nil {
    log.Fatal(err)
}
```

#### WithAppVersion

```go
func WithAppVersion(appVersion string) ListWorkflowsOption
```

Retrieve workflows tagged with this application version.


#### WithEndTime

```go
func WithEndTime(endTime time.Time) ListWorkflowsOption
```

Retrieve workflows started before this timestamp.

#### WithLimit

```go
func WithLimit(limit int) ListWorkflowsOption
```

Retrieve up to this many workflows.

#### WithLoadInput

```go
func WithLoadInput(loadInput bool) ListWorkflowsOption
```

WithLoadInput controls whether to load workflow input data (default: true).

#### WithLoadOutput

```go
func WithLoadOutput(loadOutput bool) ListWorkflowsOption
```

WithLoadOutput controls whether to load workflow output data (default: true). 

#### WithName

```go
func WithName(name string) ListWorkflowsOption
```

Filter workflows by the specified workflow function name.

#### WithOffset

```go
func WithOffset(offset int) ListWorkflowsOption
```

Skip this many workflows from the results returned (for pagination).

#### WithSortDesc

```go
func WithSortDesc(sortDesc bool) ListWorkflowsOption
```

Sort the results in descending (true) or ascending (false) order by workflow start time.

#### WithStartTime

```go
func WithStartTime(startTime time.Time) ListWorkflowsOption
```

Retrieve workflows started after this timestamp.

#### WithStatus

```go
func WithStatus(status []WorkflowStatusType) ListWorkflowsOption
```

Filter workflows by status. Multiple statuses can be specified.

#### WithUser

```go
func WithUser(user string) ListWorkflowsOption
```

Filter workflows run by this authenticated user.

#### WithWorkflowIDs

```go
func WithWorkflowIDs(workflowIDs []string) ListWorkflowsOption
```

Filter workflows by specific workflow IDs.

#### WithWorkflowIDPrefix

```go
func WithWorkflowIDPrefix(prefix string) ListWorkflowsOption
```

Filter workflows whose IDs start with the specified prefix.

#### WithQueuesOnly

```go
func WithQueuesOnly() ListWorkflowsOption
```

Return only workflows that are currently in a queue (queue name is not null, status is `ENQUEUED` or `PENDING`).

### GetWorkflowSteps

```go
func GetWorkflowSteps(ctx DBOSContext, workflowID string) ([]StepInfo, error)
```

GetWorkflowSteps retrieves the execution steps of a workflow.
This is a list of `StepInfo` objects, with the following structure:

```go
type StepInfo struct {
    StepID          int    // The sequential ID of the step within the workflow
    StepName        string // The name of the step function
    Output          any    // The output returned by the step (if any)
    Error           error  // The error returned by the step (if any)
    ChildWorkflowID string  // If the step starts or retrieves the result of a workflow, its ID
}
```

**Parameters:**
- **ctx**: The DBOS context.
- **workflowID**: The ID of the workflow to cancel.

### CancelWorkflow

```go
func CancelWorkflow(ctx DBOSContext, workflowID string) error
```

Cancel a workflow. This sets its status to `CANCELLED`, removes it from its queue (if it is enqueued) and preempts its execution (interrupting it at the beginning of its next step).

**Parameters:**
- **ctx**: The DBOS context.
- **workflowID**: The ID of the workflow to cancel.

### ResumeWorkflow

```go
func ResumeWorkflowR any (*WorkflowHandle[R], error)
```

Resume a workflow. This immediately starts it from its last completed step. You can use this to resume workflows that are cancelled or have exceeded their maximum recovery attempts. You can also use this to start an enqueued workflow immediately, bypassing its queue.

**Parameters:**
- **ctx**: The DBOS context.
- **workflowID**: The ID of the workflow to resume.

### ForkWorkflow

```go
func ForkWorkflowR any (WorkflowHandle[R], error)
```

Start a new execution of a workflow from a specific step. The input step ID (`startStep`) must match the step number of the step returned by workflow introspection. The specified `startStep` is the step from which the new workflow will start, so any steps whose ID is less than `startStep` will not be re-executed.

**Parameters:**
- **ctx**: The DBOS context.
- **input**: A `ForkWorkflowInput` struct where `OriginalWorkflowID` is mandatory.

```go
type ForkWorkflowInput struct {
    OriginalWorkflowID string // Required: The UUID of the original workflow to fork from
    ForkedWorkflowID   string // Optional: Custom workflow ID for the forked workflow (auto-generated if empty)
    StartStep          uint   // Optional: Step to start the forked workflow from (default: 0)
    ApplicationVersion string // Optional: Application version for the forked workflow (inherits from original if empty)
}
```

### Workflow Status

Some workflow introspection and management methods return a `WorkflowStatus`.
This object has the following definition:

```go
type WorkflowStatus struct {
    ID                 string             `json:"workflow_uuid"`       // Unique identifier for the workflow
    Status             WorkflowStatusType `json:"status"`              // Current execution status
    Name               string             `json:"name"`                // Function name of the workflow
    AuthenticatedUser  *string            `json:"authenticated_user"`  // User who initiated the workflow (if applicable)
    AssumedRole        *string            `json:"assumed_role"`        // Role assumed during execution (if applicable)
    AuthenticatedRoles *string            `json:"authenticated_roles"` // Roles available to the user (if applicable)
    Output             any                `json:"output"`              // Workflow output (available after completion)
    Error              error              `json:"error"`               // Error information (if status is ERROR)
    ExecutorID         string             `json:"executor_id"`         // ID of the executor running this workflow
    CreatedAt          time.Time          `json:"created_at"`          // When the workflow was created
    UpdatedAt          time.Time          `json:"updated_at"`          // When the workflow status was last updated
    ApplicationVersion string             `json:"application_version"` // Version of the application that created this workflow
    ApplicationID      string             `json:"application_id"`      // Application identifier
    Attempts           int                `json:"attempts"`            // Number of execution attempts
    QueueName          string             `json:"queue_name"`          // Queue name (if workflow was enqueued)
    Timeout            time.Duration      `json:"timeout"`             // Workflow timeout duration
    Deadline           time.Time          `json:"deadline"`            // Absolute deadline for workflow completion
    StartedAt          time.Time          `json:"started_at"`          // When the workflow execution actually started
    DeduplicationID    string             `json:"deduplication_id"`    // Deduplication identifier (if applicable)
    Input              any                `json:"input"`               // Input parameters passed to the workflow
    Priority           int                `json:"priority"`            // Execution priority (lower numbers have higher priority)
}
```

#### WorkflowStatusType

The `WorkflowStatusType` represents the execution status of a workflow:

```go
type WorkflowStatusType string

const (
    WorkflowStatusPending                     WorkflowStatusType = "PENDING"                        // Workflow is running or ready to run
    WorkflowStatusEnqueued                    WorkflowStatusType = "ENQUEUED"                       // Workflow is queued and waiting for execution
    WorkflowStatusSuccess                     WorkflowStatusType = "SUCCESS"                        // Workflow completed successfully
    WorkflowStatusError                       WorkflowStatusType = "ERROR"                          // Workflow completed with an error
    WorkflowStatusCancelled                   WorkflowStatusType = "CANCELLED"                      // Workflow was cancelled (manually or due to timeout)
    WorkflowStatusMaxRecoveryAttemptsExceeded WorkflowStatusType = "MAX_RECOVERY_ATTEMPTS_EXCEEDED" // Workflow exceeded maximum retry attempts
)
```

## DBOS Variables

### GetWorkflowID

```go
func GetWorkflowID(ctx DBOSContext) (string, error)
```

Return the ID of the current workflow, if in a workflow. Returns an error if not called from within a workflow context.

**Parameters:**
- **ctx**: The DBOS context.

### GetStepID

```go
func GetStepID(ctx DBOSContext) (string, error)
```

Return the unique ID of the current step within a workflow. Returns an error if not called from within a step context.

**Parameters:**
- **ctx**: The DBOS context.


Workflow queues allow you to ensure that workflow functions will be run, without starting them immediately.
Queues are useful for controlling the number of workflows run in parallel, or the rate at which they are started.

All queues should be created before DBOS is launched.

### NewWorkflowQueue

```go
func NewWorkflowQueue(dbosCtx DBOSContext, name string, options ...queueOption) WorkflowQueue
```

NewWorkflowQueue creates a new workflow queue with the specified name and configuration options.
Queues must be created before DBOS is launched.
You can enqueue a workflow using the `WithQueue` parameter of `RunWorkflow`.

**Parameters:**
- **dbosCtx**: The DBOSContext.
- **name**: The name of the queue.  Must be unique among all queues in the application.
- **options**: Functional options for the queue, documented below.

**Example Syntax:**

```go
queue := dbos.NewWorkflowQueue(ctx, "email-queue",
    dbos.WithWorkerConcurrency(5),
    dbos.WithRateLimiter(&dbos.RateLimiter{
        Limit:  100,
        Period: 60 * time.Second, // 100 workflows per minute
    }),
    dbos.WithPriorityEnabled(),
)

// Enqueue workflows to this queue:
handle, err := dbos.RunWorkflow(ctx, SendEmailWorkflow, emailData, dbos.WithQueue("email-queue"))
```

#### WithWorkerConcurrency

```go
func WithWorkerConcurrency(concurrency int) queueOption
```

Set the maximum number of workflows from this queue that may run concurrently within a single DBOS process.

#### WithGlobalConcurrency

```go
func WithGlobalConcurrency(concurrency int) queueOption
```

Set the maximum number of workflows from this queue that may run concurrently. Defaults to 0 (no limit).
This concurrency limit is global across all DBOS processes using this queue.

####  WithMaxTasksPerIteration

```go
func WithMaxTasksPerIteration(maxTasks int) queueOption
```

Sets the maximum number of workflows that can be dequeued in a single iteration.
This controls batch sizes for queue processing.

####  WithPriorityEnabled

```go
func WithPriorityEnabled() queueOption
```

Enable setting priority for workflows on this queue.

####  WithRateLimiter

```go
func WithRateLimiter(limiter *RateLimiter) queueOption
```

```go
type RateLimiter struct {
    Limit  int     // Maximum number of workflows to start within the period
    Period time.Duration // Time period for the rate limit
}
```

A limit on the maximum number of functions which may be started in a given period.

### RegisterWorkflow

```go
func RegisterWorkflowP any, R any
```

Register a function as a DBOS workflow.
All workflows must be registered before the context is launched.

Workflow functions must be compatible with the following signature:

```go
type Workflow[P any, R any] func(ctx DBOSContext, input P) (R, error)
```

**Parameters:**
- **ctx**: The DBOSContext.
- **fn**: The workflow function to register.
- **opts**: Functional options for workflow registration, documented below.

#### WithMaxRetries

```go
func WithMaxRetries(maxRetries int) WorkflowRegistrationOption
```

Configure the maximum number of times execution of a workflow may be attempted.
This acts as a dead letter queue so that a buggy workflow that crashes its application (for example, by running it out of memory) does not do so infinitely.
If a workflow exceeds this limit, its status is set to `MAX_RECOVERY_ATTEMPTS_EXCEEDED` and it may no longer be executed.

#### WithSchedule

```go
func WithSchedule(schedule string) WorkflowRegistrationOption
```

Registers the workflow as a scheduled workflow using cron syntax.
The schedule string follows standard cron format with second precision.
Scheduled workflows automatically receive a `time.Time` input parameter. 

#### WithWorkflowName

```go
func WithWorkflowName(name string) WorkflowRegistrationOption
```

Register a workflow with a custom name.
If not provided, the name of the workflow function is used.

### RunWorkflow

```go
func RunWorkflowP any, R any (WorkflowHandle[R], error)
```

Execute a workflow function.
The workflow may execute immediately or be enqueued for later execution based on options.
Returns a WorkflowHandle that can be used to check the workflow's status or wait for its completion and retrieve its results.

**Parameters:**
- **ctx**: The DBOSContext.
- **fn**: The workflow function to execute.
- **input** The input to the workflow function.
- **opts**: Functional options for workflow execution, documented below.

**Example Syntax**:

```go
func workflow(ctx dbos.DBOSContext, input string) (string, error) {
    return "success", err
}

func example(input string) error {
    handle, err := dbos.RunWorkflow(dbosContext, workflow, input)
    if err != nil {
        return err
    }
    result, err := handle.GetResult()
    if err != nil {
        return err
    }
    fmt.Println("Workflow result:", result)
    return nil
}
```

#### WithWorkflowID

```go
func WithWorkflowID(id string) WorkflowOption
```

Run the workflow with a custom workflow ID.
If not specified, a UUID workflow ID is generated.

#### WithQueue

```go
func WithQueue(queueName string) WorkflowOption
```

Enqueue the workflow to the specified queue instead of executing it immediately.
Queued workflows will be dequeued and executed according to the queue's configuration.

#### WithDeduplicationID

```go
func WithDeduplicationID(id string) WorkflowOption
```

Set a deduplication ID for this workflow.
Should be used alongside `WithQueue`.
At any given time, only one workflow with a specific deduplication ID can be enqueued in a given queue.
If a workflow with a deduplication ID is currently enqueued or actively executing (status `ENQUEUED` or `PENDING`), subsequent workflow enqueue attempt with the same deduplication ID in the same queue will raise an exception.

#### WithPriority

```go
func WithPriority(priority uint) WorkflowOption
```

Set a queue priority for the workflow.
Should be used alongside `WithQueue`.
Workflows with the same priority are dequeued in **FIFO (first in, first out)** order.
Priority values can range from `1` to `2,147,483,647`, where **a low number indicates a higher priority**. 
Workflows without assigned priorities have the highest priority and are dequeued before workflows with assigned priorities.

#### WithApplicationVersion

```go
func WithApplicationVersion(version string) WorkflowOption
```

Set the application version for this workflow, overriding the version in DBOSContext.

#### WithAuthenticatedUser

```go
func WithAuthenticatedUser(user string) WorkflowOption
```

Associate the workflow execution with a user name. Useful to define workflow identity.

### RunAsStep

```go
func RunAsStepR any (R, error)
```

Execute a function as a step in a durable workflow.

**Parameters:**
- **ctx**: The DBOSContext.
- **fn**: The step to execute, typically wrapped in an anonymous function. Syntax shown below.
- **opts**: Functional options for step execution, documented below.

**Example Syntax:**

Any Go function can be a step as long as it outputs one gob-encodable value and an error.
To pass inputs into a function being called as a step, wrap it in an anonymous function as shown below:

```go
func step(ctx context.Context, input string) (string, error) {
    output := ...
    return output
}

func workflow(ctx dbos.DBOSContext, input string) (string, error) {
    output, err := dbos.RunAsStep(
        ctx, 
        func(stepCtx context.Context) (string, error) {
            return step(stepCtx, input)
        }
    )
}
```

#### WithStepName

```go
func WithStepName(name string) StepOption
```

Set a custom name for a step.

#### WithStepMaxRetries

```go
func WithStepMaxRetries(maxRetries int) StepOption
```

Set the maximum number of times this step is automatically retired on failure.
A value of 0 (the default) indicates no retries.

#### WithMaxInterval

```go
func WithMaxInterval(interval time.Duration) StepOption
```

WithMaxInterval sets the maximum delay between retries. Default value is 5s.

#### WithBackoffFactor

```go
func WithBackoffFactor(factor float64) StepOption
```

WithBackoffFactor sets the exponential backoff multiplier between retries. Default value is 2.0. 

#### WithBaseInterval

```go
func WithBaseInterval(interval time.Duration) StepOption
```

WithBaseInterval sets the initial delay between retries. Default value is 100ms. 

### WorkflowHandle

```go
type WorkflowHandle[R any] interface {
    GetResult() (R, error)
    GetStatus() (WorkflowStatus, error)
    GetWorkflowID() string
}
```

WorkflowHandle provides methods to interact with a running or completed workflow.
The type parameter `R` represents the expected return type of the workflow.
Handles can be used to wait for workflow completion, check status, and retrieve results. 

#### WorkflowHandle.GetResult

```go
WorkflowHandle.GetResult(opts ...GetResultOption) (R, error)
```

Wait for the workflow to complete and return its result.

#### WorkflowHandle.GetStatus

```go
WorkflowHandle.GetStatus() (WorkflowStatus, error)
```

Retrieve the WorkflowStatus of the workflow.

#### WorkflowHandle.GetWorkflowID

```go
WorkflowHandle.GetWorkflowID() string
```

Retrieve the ID of the workflow.


`Client` provides a programmatic way to interact with your DBOS application from external code.
`Client` includes methods similar to `DBOSContext` that can be used outside of a DBOS application.

:::note[]
`Client` is included in the `dbos` package, the same package that is used by DBOS applications.
Where DBOS applications use the `DBOSContext` methods,
external applications use `Client` methods instead.
:::

```go
type Client interface {
    Enqueue(queueName, workflowName string, input any, opts ...EnqueueOption) (WorkflowHandle[any], error)
    ListWorkflows(opts ...ListWorkflowsOption) ([]WorkflowStatus, error)
    Send(destinationID string, message any, topic string) error
    GetEvent(targetWorkflowID, key string, timeout time.Duration) (any, error)
    RetrieveWorkflow(workflowID string) (WorkflowHandle[any], error)
    CancelWorkflow(workflowID string) error
    ResumeWorkflow(workflowID string) (WorkflowHandle[any], error)
    ForkWorkflow(input ForkWorkflowInput) (WorkflowHandle[any], error)
    GetWorkflowSteps(workflowID string) ([]StepInfo, error)
    Shutdown(timeout time.Duration)
}
```

### Constructor

```go
func NewClient(ctx context.Context, config ClientConfig) (Client, error)
```

**Parameters:**
- `ctx`: A context for initialization operations
- `config`: A `ClientConfig` object with connection and application settings

```go
type ClientConfig struct {
    DatabaseURL        string        // DatabaseURL is a PostgreSQL connection string. Either this or SystemDBPool is required.
    SystemDBPool       *pgxpool.Pool // SystemDBPool is a custom System Database Pool. It's optional and takes precedence over DatabaseURL if both are provided.
    DatabaseSchema string            // Database schema name (defaults to "dbos")
    Logger             *slog.Logger  // Optional custom logger
}
```

**Returns:**
- A new `Client` instance or an error if initialization fails

**Example syntax:**

This DBOS client connects to the system database specified in the configuration:

```go
config := dbos.ClientConfig{
    DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
}
client, err := dbos.NewClient(context.Background(), config)
if err != nil {
    log.Fatal(err)
}
defer client.Shutdown(5 * time.Second)
```

A client manages a connection pool to the DBOS system database. Calling `Shutdown` on a client will release the connection pool.


### Shutdown

```go
Shutdown(timeout time.Duration)
```

Gracefully shuts down the client and releases the system database connection pool.

**Parameters:**
- `timeout`: Maximum time to wait for graceful shutdown

## Workflow Interaction Methods

### Enqueue

```go
func Enqueue[P any, R any](
    c Client, 
    queueName string,
    workflowName string, 
    input P, 
    opts ...EnqueueOption
) (WorkflowHandle[R], error)
```

Enqueue a workflow for processing and return a handle to it, similar to RunWorkflow with the WithQueue option.
Returns a WorkflowHandle.

When enqueuing a workflow from the DBOS client, you must specify the name of the workflow to enqueue (rather than passing a workflow function as with `RunWorkflow`.)

Required parameters:

* `c`: The DBOS client instance
* `queueName`: The name of the queue on which to enqueue the workflow
* `workflowName`: The name of the workflow function being enqueued
* `input`: The input to pass to the workflow

Optional configuration via `EnqueueOption`:

* `WithEnqueueWorkflowID(id string)`: The unique ID for the enqueued workflow. 
If left undefined, DBOS Client will generate a UUID. 
Please see Workflow IDs and Idempotency for more information.
* `WithEnqueueApplicationVersion(version string)`: The version of your application that should process this workflow. 
If left undefined, it will use the current application version.
Please see Managing Application Versions for more information.
* `WithEnqueueTimeout(timeout time.Duration)`: Set a timeout for the enqueued workflow. When the timeout expires, the workflow **and all its children** are cancelled (except if the child's context has been made uncancellable using `WithoutCancel`). The timeout does not begin until the workflow is dequeued and starts execution.
* `WithEnqueueDeduplicationID(id string)`: At any given time, only one workflow with a specific deduplication ID can be enqueued in the specified queue. If a workflow with a deduplication ID is currently enqueued or actively executing (status `ENQUEUED` or `PENDING`), subsequent workflow enqueue attempts with the same deduplication ID in the same queue will fail.
* `WithEnqueuePriority(priority uint)`: The priority of the enqueued workflow in the specified queue. Workflows with the same priority are dequeued in **FIFO (first in, first out)** order. Priority values can range from `1` to `2,147,483,647`, where **a low number indicates a higher priority**. Workflows without assigned priorities have the highest priority and are dequeued before workflows with assigned priorities.

**Example syntax:**

```go
type ProcessInput struct {
    TaskID string
    Data   string
}

type ProcessOutput struct {
    Result string
    Status string
}

handle, err := dbos.Enqueue[ProcessInput, ProcessOutput](
    client, 
    "process_queue",
    "ProcessWorkflow",
    ProcessInput{TaskID: "task-123", Data: "data"},
    dbos.WithEnqueueTimeout(30 * time.Minute),
    dbos.WithEnqueuePriority(5),
)
if err != nil {
    log.Fatal(err)
}

result, err := handle.GetResult()
if err != nil {
    log.Printf("Workflow failed: %v", err)
} else {
    log.Printf("Result: %+v", result)
}
```

### RetrieveWorkflow

```go
RetrieveWorkflow(workflowID string) (WorkflowHandle[any], error)
```

Retrieve the handle of a workflow with identity `workflowID`.
Similar to `RetrieveWorkflow`.

**Parameters:**
- `workflowID`: The identifier of the workflow whose handle to retrieve

**Returns:**
- The WorkflowHandle of the workflow whose ID is `workflowID`

### Send

```go
Send(destinationID string, message any, topic string) error
```

Sends a message to a specified workflow. Similar to `Send`.

**Parameters:**
- `destinationID`: The workflow to which to send the message
- `message`: The message to send. Must be serializable
- `topic`: A topic with which to associate the message. Messages are enqueued per-topic on the receiver

### GetEvent

```go
GetEvent(targetWorkflowID, key string, timeout time.Duration) (any, error)
```

Retrieve the latest value of an event published by the workflow identified by `targetWorkflowID` to the key `key`.
If the event does not yet exist, wait for it to be published, returning an error if the wait times out.
Similar to `GetEvent`.

**Parameters:**
- `targetWorkflowID`: The identifier of the workflow whose events to retrieve
- `key`: The key of the event to retrieve
- `timeout`: A timeout duration. If the wait times out, return an error

**Returns:**
- The value of the event published by `targetWorkflowID` with name `key`, or an error if the wait times out

## Workflow Management Methods

### ListWorkflows

```go
ListWorkflows(opts ...ListWorkflowsOption) ([]WorkflowStatus, error)
```

Retrieve a list of `WorkflowStatus` of all workflows matching specified criteria.
Similar to `ListWorkflows`.

**Options:**
Options are provided via `ListWorkflowsOption` functions. See `ListWorkflows` for available options.

:::warning
The client `ListWorkflows` method does not include workflow inputs and outputs in its results.
:::

### GetWorkflowSteps

```go
GetWorkflowSteps(workflowID string) ([]StepInfo, error)
```

List the steps of a given workflow. Returned entries do not include step outputs.

### CancelWorkflow

```go
CancelWorkflow(workflowID string) error
```

Cancel a workflow.
This sets its status to `CANCELLED`, removes it from its queue (if it is enqueued) and preempts its execution (interrupting it at the beginning of its next step).
Similar to `CancelWorkflow`.

### ResumeWorkflow

```go
ResumeWorkflow(workflowID string) (WorkflowHandle[any], error)
```

Resume a workflow.
This immediately starts it from its last completed step.
You can use this to resume workflows that are cancelled or have exceeded their maximum recovery attempts.
You can also use this to start an enqueued workflow immediately, bypassing its queue.
Similar to `ResumeWorkflow`.

### ForkWorkflow

```go
ForkWorkflow(input ForkWorkflowInput) (WorkflowHandle[any], error)
```

Similar to `ForkWorkflow`.
