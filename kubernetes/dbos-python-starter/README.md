# DBOS Python starter (Kubernetes)

Python port of the Go starter in `../dbos-go-starter/`. Mirrors the same endpoints and uses a database-backed queue (`taskQueue`, `worker_concurrency=2`).

## Endpoints

- `GET /healthz` — health probe
- `GET /workflow/{task_id}` — run the three-step `example_workflow` with the given workflow id
- `GET /last_step/{task_id}` — last completed step for the given workflow id (via `DBOS.set_event` / `get_event`)
- `GET /enqueue/{duration}` — enqueue a `sleep_workflow` on `taskQueue` that sleeps for `duration` seconds
- `GET /enqueue_batch/{count}/{duration}` — enqueue `count` `sleep_workflow`s, each sleeping for `duration` seconds
- `GET /long_sleep` — start `long_sleep_workflow` (sleeps 10 hours), returns the workflow id
- `GET /metrics/{queue_name}` — current queue length (PENDING + ENQUEUED), shape `{"queue_length": N}`

## Run locally

```bash
pip install -r requirements.txt
export DBOS_SYSTEM_DATABASE_URL=postgres://postgres:dbos@localhost:5432/dbos_python
python main.py
```

## Deploy to Kubernetes (simple)

```bash
kubectl create namespace dbos-demo
kubectl apply -f manifests/postgres.yaml
# Build & push the image to ECR (update repo URL in dbos-app.yaml)
kubectl apply -f manifests/dbos-app.yaml
kubectl port-forward -n dbos-demo svc/dbos-python-app 8000:8000
```

Then:

```bash
curl http://localhost:8000/workflow/test-1
curl http://localhost:8000/last_step/test-1
curl http://localhost:8000/enqueue/30
```
