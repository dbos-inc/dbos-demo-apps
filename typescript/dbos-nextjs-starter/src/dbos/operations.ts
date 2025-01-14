import { DBOS } from "@dbos-inc/dbos-sdk";

export class dbosWorkflowClass {

   @DBOS.transaction()
   static async backgroundTaskStep(step: number) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      DBOS.logger.info(`Completed step ${step}`);
   }

   @DBOS.workflow()
   static async backgroundTask(n: number) {
       for (let i = 1; i <= n; i++) {
           await dbosWorkflowClass.backgroundTaskStep(i);
           await DBOS.setEvent("steps_event", i)
       }
       DBOS.logger.info("Background task complete!");
   }
}

if (process.env.NEXT_PHASE !== "phase-production-build") {
   await DBOS.launch()
} 