# DBOS + Cloud Run

This demo app runs durable DBOS workflows on Google Cloud Run and shows how to use the Cloud Run API to automatically scale the worker pool based on queue depth.

## What It Does

The app has two simple workflows: `ExampleWorkflow` that can be triggered by HTTP requests and `ScheduledWorkflow`, which periodically enqueue a few `ExampleWorkflow` onto a task queue, generating a steady stream of work that the worker pool needs to process.

In addition, it declares a third workflow, `ScalingWorkflow`, responsible for sizing the worker pool. It checks how many workflows are sitting in the queue, divides by the per-worker concurrency limit, and calls the Cloud Run Admin API to adjust the worker pool's instance count accordingly.

## Cloud Run Integration

We set the DBOS application version to the `K_REVISION` environment variable.

## Worker Pool Scaling

The autoscaler uses the Cloud Run Admin v2 API at `run.googleapis.com/v2/projects/{project}/locations/{region}/workerPools/{name}`:

- **GET** to read the current `scaling.manualInstanceCount`
- **PATCH** with `?updateMask=scaling,launchStage` to set a new instance count

## Deploying to Cloud Run
Use the provided [Dockerfile](./Dockerfile) to build and deploy the app to Cloud Run. Make sure to set the required environment variables (e.g. `DBOS_API_KEY`, `GCP_PROJECT`, `GCP_REGION`) in the Cloud Run service configuration.

## Local Development

1. Install dependencies:

```bash
go mod tidy
```

2. Install the DBOS CLI and start a local Postgres:

```bash
go install github.com/dbos-inc/dbos-transact-golang/cmd/dbos@latest
dbos postgres start
```

3. Copy `.env` and fill in your values, then source it:

```bash
source .env
```

4. Run the app:

```bash
go run main.go
```

The app serves at `http://localhost:8080`. Note that the autoscaling workflow will fail locally since there's no GCP metadata server or worker pool -- the core workflow and crash-recovery demo still work fine.

