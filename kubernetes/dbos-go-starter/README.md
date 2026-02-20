# Autoscale a DBOS application on Kubernetes with KEDA

Queues are the prime mechanism to control load in a DBOS application. For example you can set a per-worker concurrency cap on a DBOS queue, controlling how many tasks a single worker can dequeue. You can then estimate how many workers are required at any given time to handle a queue's tasks by dividing the number of tasks in the queue by the worker concurrency limit.

In this tutorial, we walk you through configuring KEDA on Kubernetes to scale pods based on DBOS queue utilization, using the metric API.

## The application

For this tutorial we'll use a single queue with worker concurrency limits. The application will expose an endpoint which will enqueue a single workflow, set to sleep for a configurable duration.

This sample application uses Transact Golang and is applicable to all DBOS SDKs and KEDA-able Kubernetes clusters.

<details><summary><strong>Configuration for EKS deployment</strong></summary>

Before deploying, you need to configure environment-specific values:

1. Copy the example environment file:
   ```bash
   cp .env.sh.example .env.sh
   ```

2. Edit `.env.sh` and update the following values:
   - **ECR_REPO**: Your AWS ECR repository URL (e.g., `ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/REPO_NAME`)
   - **AWS_REGION**: Your AWS region (e.g., `us-east-1`)
   - **AWS_LB_SUBNETS**: Comma-separated list of subnet IDs for your AWS Load Balancer
   - **POSTGRES_PASSWORD**: A secure password for PostgreSQL
   - **KUBERNETES_NAMESPACE**: The Kubernetes namespace where you'll deploy (default: `default`)
   - **DBOS_APP_NAME**: The name for your DBOS application (default: `dbos-app`)

   The `.env.sh` file is gitignored and will not be committed to the repository.

3. Generate Kubernetes manifests from templates:
   ```bash
   ./deploy.sh
   ```

   This will create generated manifests in `manifests/generated/` directory.

4. To deploy to your cluster:
   ```bash
   ./deploy.sh --apply
   ```

   Or apply manually:
   ```bash
   kubectl apply -f manifests/generated/
   ```

</details>

## Setup

This section assumes you already have a Kubernetes cluster deployed. You'll need a Postgres instance to backup your application.
<details><summary><strong>Sample Postgres manifest</strong></summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: pgvector/pgvector:pg16
          env:
            - name: POSTGRES_USER
              value: "postgres"
            - name: POSTGRES_PASSWORD
              value: "dbos"
          ports:
            - containerPort: 5432
          volumeMounts:
            - mountPath: /var/lib/postgresql/data
              name: postgres-storage
      volumes:
        - name: postgres-storage
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
```

</details>

### Install KEDA

[Install KEDA](https://keda.sh/docs/2.18/deploy/). To verify KEDA is running:

```bash
kubectl get pods -n keda
```

You should see KEDA operator and metrics server pods running.

### Build and Push Docker Image

Build and push your Docker image to ECR:

```bash
./build-and-push.sh [tag]
```

If no tag is provided, it will use the `IMAGE_TAG` value from `.env.sh` (default: `latest`).

### Deploy a DBOS application

The deployment manifests are generated from templates using the values in your `.env.sh` file. See the [Configuration](#configuration) section above for setup instructions.

<details><summary><strong>Sample DBOS application manifest</strong></summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dbos-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: dbos-app
  template:
    metadata:
      labels:
        app: dbos-app
    spec:
      containers:
        - name: dbos-app
          image: YOUR_ECR_REPO:kubernetes-integration-latest
          env:
            - name: DBOS_SYSTEM_DATABASE_URL
              value: postgres://postgres:YOUR_PASSWORD@postgres:5432/kube
          ports:
            - containerPort: 8000
---
apiVersion: v1
kind: Service
metadata:
  name: dbos-app
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"
    service.beta.kubernetes.io/aws-load-balancer-subnets: "subnet-xxx,subnet-yyy,subnet-zzz"
spec:
  type: LoadBalancer
  selector:
    app: dbos-app
  ports:
    - port: 8000
      targetPort: 8000
```

</details>

### Configure a KEDA scaled object

Now let's instruct KEDA to scale our application's pods based on a queue utilization metric exposed by the application itself.

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: dbos-app-scaledobject
spec:
  scaleTargetRef:
    name: dbos-app
  minReplicaCount: 1
  maxReplicaCount: 100  # Adjust as needed
  triggers:
  - type: metrics-api
    metadata:
      url: http://dbos-app.default.svc.cluster.local:8000/metrics/queueName # `queueName` must match the name under which the DBOS queue was registered
      valueLocation: queue_length
      targetValue: "2"  # Set to your worker concurrency value
```

The `valueLocation` field represents a JSON field in the `/metrics` endpoint response.
`targetValue: "2"` means we want a number of worker equal to the queue length divided by 2 (in this example, the queue's worker concurrency is 2). Specifically: `desiredReplicas = queue_length / targetValue`

## The metrics endpoint

The endpoint we registered with the KEDA scaler returns the current size of the specified queue (which is made of all `PENDING` and `ENQUEUED` DBOS workflows on the queue.)

```golang
type MetricsResponse struct {
	QueueLength int `json:"queue_length"`
}

r.GET("/metrics/:queueName", func(c *gin.Context) {
	queueName := c.Param("queueName")
	workflows, err := dbos.ListWorkflows(dbosContext, dbos.WithQueuesOnly(), dbos.WithQueueName(queueName))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Error computing metrics: %v", err)})
		return
	}

	c.JSON(http.StatusOK, MetricsResponse{QueueLength: len(workflows)})
})
```

## Try it

First, get your Load Balancer URL:

```bash
kubectl get service dbos-app -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

Then, using the endpoint in the application, enqueue a number of workflows that exceeds the concurrency limit, for example:

```bash
# Replace YOUR_LOAD_BALANCER with the hostname from above
# Enqueue 10 workflows that sleep for 30 seconds each
for i in {1..10}; do curl -s http://YOUR_LOAD_BALANCER:8000/enqueue/30 & done;
```

Watch the pods scale up:

```bash
# Watch pods in real-time
watch -n 1 kubectl get pods -l app=dbos-app
```

You should see the number of pods increase as KEDA detects the queue backlog. With `workerConcurrency: 1` and 10 enqueued workflows, you should see up to 10 pods.