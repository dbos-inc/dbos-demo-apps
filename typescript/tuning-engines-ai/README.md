# Tuning Engines governed AI workflow

This example shows how to call a Tuning Engines OpenAI-compatible endpoint from
a durable DBOS workflow. DBOS owns workflow recovery, retries, step state, and
database-backed execution. Tuning Engines owns model routing, policy checks,
approval decisions, usage attribution, and trace correlation.

## Setup

Install dependencies and build the example:

```bash
npm install
npm run build
```

Set a Tuning Engines inference key and model:

```bash
export TE_INFERENCE_KEY="sk-te-your-inference-key"
export TE_MODEL="auto"
```

Start Postgres, or set `DBOS_SYSTEM_DATABASE_URL` if you already have a
database:

```bash
npx dbos postgres start
```

## Run

```bash
npm start -- "Draft a rollout checklist for a new support agent"
```

The CLI prints the DBOS workflow ID. If the process is interrupted, rerun with
the same workflow ID and DBOS will recover from durable workflow history:

```bash
npm start -- "Draft a rollout checklist for a new support agent" --workflow-id <id>
```

## What the example demonstrates

- A DBOS workflow wraps the model call in `DBOS.runStep`.
- The model call uses the Tuning Engines `/v1/chat/completions` endpoint.
- The workflow passes `X-TE-Run-ID` and `X-TE-Request-ID` headers so Tuning
  Engines can correlate provider usage, policy decisions, approvals, and trace
  events.
- A follow-up durable step posts an observed-only trace to `/api/v1/traces`.

Use the same `run_id` when recording state references or outcomes so DBOS
workflow history and Tuning Engines runtime traces stay linked.
