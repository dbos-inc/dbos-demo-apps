import { DBOS, SchedulerMode } from "@dbos-inc/dbos-sdk";

import { TaskOption } from "@/types/models";
import { doTaskFetch, schedulableTasks } from "./tasks";
import { TriggerOperation } from '@dbos-inc/pgnotifier-receiver';
import { DBOSBored } from "./dbos_bored";
export { DBOSBored };
import { ScheduleDBOps, trig } from "./dbtransactions";
export { ScheduleDBOps };
import { getOccurrencesAt } from "../types/taskschedule";
import { WebSocket } from "ws";

import { SESv2 } from '@aws-sdk/client-sesv2';

globalThis.DBOSBored = DBOSBored;

if (!globalThis.reportSes && (process.env['REPORT_EMAIL_TO_ADDRESS'] && process.env['REPORT_EMAIL_FROM_ADDRESS'])) {
  let ok = true;
  if (!process.env['AWS_REGION']) {
    ok = false;
    DBOS.logger.warn('`REPORT_EMAIL_TO_ADDRESS` and `REPORT_EMAIL_FROM_ADDRESS` are set, but `AWS_REGION` is not.');
  }
  if (!process.env['AWS_ACCESS_KEY_ID']) {
    ok = false;
    DBOS.logger.warn('`REPORT_EMAIL_TO_ADDRESS` and `REPORT_EMAIL_FROM_ADDRESS` are set, but `AWS_ACCESS_KEY_ID` is not.');
  }
  if (!process.env['AWS_SECRET_ACCESS_KEY']) {
    ok = false;
    DBOS.logger.warn('`REPORT_EMAIL_TO_ADDRESS` and `REPORT_EMAIL_FROM_ADDRESS` are set, but `AWS_SECRET_ACCESS_KEY` is not.');
  }
  if (ok) {
    globalThis.reportSes = new SESv2({
      region: process.env['AWS_REGION'],
      credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
      },
    });
  }
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

  @DBOS.step()
  static async sendStatusEmail(subject: string, body: string) {
    if (!globalThis.reportSes) return;
    await globalThis.reportSes.sendEmail({
      FromEmailAddress: process.env['REPORT_EMAIL_FROM_ADDRESS']!,
      Destination: { ToAddresses: [process.env['REPORT_EMAIL_TO_ADDRESS']!] },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: body, Charset: 'utf-8' },
          },
        },
      },
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
    const gss = globalThis.webSocketClients;
    DBOS.logger.debug(`WebSockets: Sending update '${type}' to ${gss?.size} clients`);
    gss?.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({type}));
      }
    });
  }

  @trig.trigger({tableName: 'schedule', useDBNotifications: true, installDBTrigger: false})
  static async scheduleListener(_operation: TriggerOperation, _key: string[], _record: unknown) {
    SchedulerOps.notifyListeners('schedule');
    return Promise.resolve();
  }

  @trig.trigger({tableName: 'results', useDBNotifications: true, installDBTrigger: false})
  static async resultListener(_operation: TriggerOperation, _key: string[], _record: unknown) {
    SchedulerOps.notifyListeners('result');
    return Promise.resolve();
  }
}