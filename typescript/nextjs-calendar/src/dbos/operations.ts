import { DBOS, SchedulerMode } from "@dbos-inc/dbos-sdk";

import { TaskOption } from "@/types/models";
import { doTaskFetch, schedulableTasks } from "./tasks";
import { DBOSBored } from "./dbos_bored";
export { DBOSBored };
import { ScheduleDBOps } from "./dbtransactions";
export { ScheduleDBOps };
import { getOccurrencesAt } from "../types/taskschedule";
import { WebSocket } from "ws";

import { DBOS_SES } from '@dbos-inc/dbos-email-ses';
import { DBTrigger, TriggerOperation } from '@dbos-inc/dbos-dbtriggers';

export interface SchedulerAppGlobals {
  webSocketClients?: Set<WebSocket>;
  reportSes ?: DBOS_SES;
};

const gThis = globalThis as SchedulerAppGlobals;
if (!gThis.reportSes && (process.env['REPORT_EMAIL_TO_ADDRESS'] && process.env['REPORT_EMAIL_FROM_ADDRESS'])) {
  gThis.reportSes = DBOS.configureInstance(DBOS_SES, 'reportSES', {awscfgname: 'aws_config'});
}

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

  // Note, while this is not a @DBOS.step, DBOS_SES.sendEmail is.
  static async sendStatusEmail(subject: string, body: string) {
    if (!gThis.reportSes) return;
    await gThis.reportSes.sendEmail({
      to: [process.env['REPORT_EMAIL_TO_ADDRESS']!],
      from: process.env['REPORT_EMAIL_FROM_ADDRESS']!,
      subject: subject,
      bodyText: body,
    });
  }

  @DBOS.workflow()
  static async runJob(sched: string, task: string, time: Date) {
    DBOS.logger.info(`Running ${task} at ${time.toString()}`);

    let resstr = "";
    let errstr = "";

    try {
      // Fetch the result
      const res = await SchedulerOps.runTask(task);
      resstr = res;

      // Store result in database
      await ScheduleDBOps.setResult(sched, task, time, res, '');
    }
    catch (e) {
      const err = e as Error;
      // Store error in database
      await ScheduleDBOps.setResult(sched, task, time, '', err.message);
      errstr = err.message;
    }

    // Tell attached clients
    SchedulerOps.notifyListeners('result');

    // Send notification
    await SchedulerOps.sendStatusEmail(
      errstr ? `Task ${task} failed` : `Task ${task} result`,
      errstr || resstr
    );
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
        DBOS.logger.debug("   ...no occurrences");
      }
      for (const occurrence of occurrences) {
        DBOS.logger.debug("   ...triggering");
        await DBOS.startWorkflow(SchedulerOps).runJob(sched.id, sched.task, occurrence);
      }
    }
  }

  // Function to broadcast calendar or result updates
  // Notify WebSockets
  static notifyListeners(type: string) {
    const gss = (globalThis as SchedulerAppGlobals).webSocketClients;
    DBOS.logger.debug(`WebSockets: Sending update '${type}' to ${gss?.size} clients`);
    gss?.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({type}));
      }
    });
  }

  @DBTrigger({tableName: 'schedule', useDBNotifications: true, installDBTrigger: false})
  static async scheduleListener(_operation: TriggerOperation, _key: string[], _record: unknown) {
    SchedulerOps.notifyListeners('schedule');
    return Promise.resolve();
  }

  @DBTrigger({tableName: 'results', useDBNotifications: true, installDBTrigger: false})
  static async resultListener(_operation: TriggerOperation, _key: string[], _record: unknown) {
    SchedulerOps.notifyListeners('result');
    return Promise.resolve();
  }
}