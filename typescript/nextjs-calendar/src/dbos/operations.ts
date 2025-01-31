import { DBOS, SchedulerMode } from "@dbos-inc/dbos-sdk";

import { TaskOption } from "@/types/models";
import { doTaskFetch, schedulableTasks } from "./tasks";
import { DBOSBored } from "./dbos_bored";
export { DBOSBored };
import { ScheduleDBOps } from "./dbtransactions";
export { ScheduleDBOps };
import { getOccurrencesAt } from "../types/taskschedule";

// Welcome to DBOS!
// This is a template application built with DBOS and Next.
export class SchedulerOps
{
  static getAllTasks(): TaskOption[] {
    return schedulableTasks.map((t) => { return {id:t.id, name: t.name}; });
  }

  @DBOS.step()
  static async runTask(task: string) {
    return doTaskFetch(task);
  }

  @DBOS.workflow()
  static async runJob(sched: string, task: string, time: Date) {
    DBOS.logger.info(`Running ${task} at ${time.toString()}`);

    try {
      // Fetch the result
      const res = await SchedulerOps.runTask(task);

      // Store in database
      await ScheduleDBOps.setResult(sched, task, time, res, '');
    }
    catch (e) {
      const err = e as Error;
      // Store in database
      await ScheduleDBOps.setResult(sched, task, time, '', err.message);
    }

    // Send notification (future)
  
  }

  @DBOS.scheduled({crontab: '* * * * *', mode: SchedulerMode.ExactlyOncePerIntervalWhenActive })
  @DBOS.workflow()
  static async runSchedule(schedTime: Date, _atTime: Date) {
    DBOS.logger.debug(`Checking schedule at ${schedTime.toString()}`);
    const schedule = await ScheduleDBOps.getSchedule();
    for (const sched of schedule) {
      DBOS.logger.debug(`  For task ${sched.task} / ${sched.start_time.toString()} / ${sched.repeat}`);
      const occurrences = getOccurrencesAt(sched, schedTime);
      if (!occurrences.length) {
        DBOS.logger.info("   ...no occurrences");
      }
      for (const occurrence of occurrences) {
        DBOS.logger.info("   ...triggering");
        await DBOS.startWorkflow(SchedulerOps).runJob(sched.id, sched.task, occurrence);
      }
    }
  }
}


// Only launch DBOS when the app starts running
if (process.env.NEXT_PHASE !== "phase-production-build") {
  await DBOS.launch();
}
