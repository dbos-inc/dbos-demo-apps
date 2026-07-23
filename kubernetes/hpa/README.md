# HPA for dbos-k8s-app

`dbos-python-app-hpa.yaml` autoscales the `dbos-k8s-app` Deployment in the
`dbos-demo` namespace based on the `dbos_queue_load` metric served by the
`dbos-k8s-operator`'s External Metrics API.

## How it scales

The operator polls every queue belonging to the app and collapses them into
one value per app via max:

```
load_q        = (ENQUEUED + PENDING on queue q) / worker_concurrency_q
reportedValue = max(load_q for q in queues with worker_concurrency)
target        = AverageValue 1
desiredPods   = ceil(reportedValue / 1)
```

So each pod is "responsible" for one full slot's worth of in-flight work on
the busiest queue. Empty queues → minReplicas (1). Two slots' worth of work
on any single queue → 2 pods. And so on, up to maxReplicas (10).

To enable queue-based autoscaling for a different app, just reference the
metric with `selector.matchLabels.app=<your-app>` — no queue label needed.

## Prerequisites

1. `dbos-k8s-operator` is deployed and its APIService is `Available=True`:
   ```
   kubectl get apiservice v1beta1.external.metrics.k8s.io
   ```
2. The operator's ConfigMap lists your app (queues are auto-discovered).
   Verify:
   ```
   kubectl get --raw '/apis/external.metrics.k8s.io/v1beta1/namespaces/dbos-demo/dbos_queue_load?labelSelector=app%3Ddbos-k8s-app' | jq .
   ```
   Should return `items: [...]` with one entry (the per-app aggregate), not
   an empty list.
3. The `dbos-k8s-app` Deployment exists in `dbos-demo`:
   ```
   kubectl -n dbos-demo get deployment dbos-k8s-app
   ```

## Apply / inspect / remove

```bash
# Apply
kubectl apply -f dbos-python-app-hpa.yaml

# Inspect
kubectl -n dbos-demo get hpa dbos-k8s-app
kubectl -n dbos-demo describe hpa dbos-k8s-app

# What replicas the controller is asking for, plus the most recent metric:
kubectl -n dbos-demo get hpa dbos-k8s-app -o jsonpath='{range .status.currentMetrics[*]}{.external.metric.name}={.external.current.value}{"\n"}{end}'

# Remove
kubectl delete -f dbos-python-app-hpa.yaml
```

## Generating load

The Python app ships with a scheduled workflow (`@DBOS.scheduled("*/10 * * * * *")`)
that enqueues an 11-second sleep onto `taskQueue` every 10 seconds. With
`worker_concurrency=2`, this drives the queue toward a steady-state load
near 1 — right where the HPA target is — and the controller's behavior at
the edge is observable.

For a heavier load test, also hit the manual enqueue endpoint:

```bash
kubectl -n dbos-demo port-forward svc/dbos-k8s-app 8000:8000 &
for i in $(seq 1 20); do curl -s "http://localhost:8000/enqueue/30" >/dev/null; done
kill %1
```

Each call enqueues a 30-second workflow. At burst of 20, depth jumps to ~20,
load to ~10, HPA scales toward 10 pods (clipped by maxReplicas).

## Tuning notes

- `behavior.scaleUp` is set to react quickly (15s stabilization). The metric
  is fresh by ~1s thanks to the operator's `interval: 1s` poll cadence; HPA
  doesn't need to smooth it heavily.
- `behavior.scaleDown` is conservative (120s stabilization). Workflows in the
  demo run 11s, so a brief dip in depth doesn't mean we should evict a pod
  that might be mid-execution.
- If you want CPU as a floor (so a small pod can't sit idle even when queue
  is empty), add a `Resource` metric block alongside the `External` one and
  set CPU `Utilization` target. HPA picks `max(replicasFromAllMetrics)`.
