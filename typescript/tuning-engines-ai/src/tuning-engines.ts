import { randomUUID } from "crypto";

const TE_API_BASE = process.env.TE_API_BASE || "https://app.tuningengines.com";
const TE_INFERENCE_BASE =
  process.env.TE_INFERENCE_BASE || "https://api.tuningengines.com/v1";
const TE_MODEL = process.env.TE_MODEL || "auto";

export interface ModelCallInput {
  prompt: string;
  run_id: string;
}

export interface ModelCallResult {
  content: string;
  request_id: string;
  model: string;
}

export interface TraceResult {
  status: "recorded" | "skipped" | "failed";
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export async function callTuningEngines(input: ModelCallInput): Promise<ModelCallResult> {
  const request_id = newId("req");
  const response = await fetch(`${TE_INFERENCE_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TE_INFERENCE_KEY}`,
      "Content-Type": "application/json",
      "X-TE-Run-ID": input.run_id,
      "X-TE-Request-ID": request_id,
    },
    body: JSON.stringify({
      model: TE_MODEL,
      messages: [{ role: "user", content: input.prompt }],
      metadata: {
        run_id: input.run_id,
        request_id,
        runtime: "dbos",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Tuning Engines request failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };

  return {
    content: payload.choices?.[0]?.message?.content || "",
    request_id,
    model: payload.model || TE_MODEL,
  };
}

export async function recordTrace(input: {
  prompt: string;
  run_id: string;
  request_id: string;
  model: string;
}): Promise<TraceResult> {
  const token = process.env.TE_TRACE_KEY || process.env.TE_INFERENCE_KEY;
  if (!token) {
    return { status: "skipped" };
  }

  const response = await fetch(`${TE_API_BASE}/api/v1/traces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      run_id: input.run_id,
      request_id: input.request_id,
      name: "dbos-governed-ai",
      runtime: "dbos",
      telemetry_source: "sdk",
      status: "succeeded",
      metadata: {
        model: input.model,
      },
      events: [
        {
          id: `evt_${input.request_id}`,
          type: "model.call",
          status: "succeeded",
          metadata: {
            request_id: input.request_id,
            run_id: input.run_id,
            model: input.model,
            prompt_length: input.prompt.length,
          },
        },
      ],
    }),
  });

  return { status: response.ok ? "recorded" : "failed" };
}
