import { DBOS } from "@dbos-inc/dbos-sdk";

import { ScheduleDBOps } from "./dbtransactions";
import { TaskOption } from "@/types/models";
import { schedulableTasks } from "./tasks";
export { ScheduleDBOps };

// Welcome to DBOS!
// This is a template application built with DBOS and Next.
export class SchedulerOps
{
  static getAllTasks(): TaskOption[] {
    return schedulableTasks.map((t) => { return {id:t.id, name: t.name}; });
  }
}


// Only launch DBOS when the app starts running
if (process.env.NEXT_PHASE !== "phase-production-build") {
  await DBOS.launch();
}
