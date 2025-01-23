import { DBOS } from "@dbos-inc/dbos-sdk";

// Welcome to DBOS!
// This is a template application built with DBOS and Next.
// It shows you how to use DBOS to build background tasks that are resilient to any failure.

export class MyWorkflow {
  // This workflow simulates a background task with N steps.

  // DBOS workflows are resilient to any failure--if your program is crashed,
  // interrupted, or restarted while running this workflow, the workflow automatically
  // resumes from the last completed step.
  @DBOS.workflow()
  static async backgroundTask(n: number) {
    for (let i = 1; i <= n; i++) {
      await MyWorkflow.backgroundTaskStep(i);
      await DBOS.setEvent("steps_event", i);
    }
  }

  @DBOS.step()
  static async backgroundTaskStep(step: number) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    DBOS.logger.info(`Completed step ${step}`);
  }
}

// Only launch DBOS when the app starts running
if (process.env.NEXT_PHASE !== "phase-production-build") {
  DBOS.launch().catch((e)=>console.log(e));
}
