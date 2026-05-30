import { DBOS } from "@dbos-inc/dbos-sdk";
import { callTuningEngines, recordTrace } from "./tuning-engines";

export interface GovernedAiInput {
  prompt: string;
  run_id: string;
}

export interface GovernedAiResult {
  content: string;
  run_id: string;
  request_id: string;
  trace_status: string;
}

async function governedAiWorkflowFunction(input: GovernedAiInput): Promise<GovernedAiResult> {
  const modelResult = await DBOS.runStep(() => callTuningEngines(input), {
    name: "callTuningEngines",
  });

  const traceResult = await DBOS.runStep(
    () =>
      recordTrace({
        prompt: input.prompt,
        run_id: input.run_id,
        request_id: modelResult.request_id,
        model: modelResult.model,
      }),
    { name: "recordTuningEnginesTrace" },
  );

  return {
    content: modelResult.content,
    run_id: input.run_id,
    request_id: modelResult.request_id,
    trace_status: traceResult.status,
  };
}

export const governedAiWorkflow = DBOS.registerWorkflow(governedAiWorkflowFunction, {
  name: "governedAiWorkflow",
});
